//! Debtors & Creditors — ledger-derived customer wallet positions (read-only).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{format_amount_commas, format_f64};
use crate::commands::authorize::{require_screen};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDebtorsCreditorsInput {
  /// `DEBTORS` (negative balance) or `CREDITORS` (positive balance).
  pub side: String,
  pub currency_code: Option<String>,
  pub search: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  /// When false, skip the expensive aggregate query; totals fields are omitted (empty strings).
  pub include_totals: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtorCreditorRow {
  pub customer_id: String,
  pub customer_name: String,
  pub account_code: String,
  pub currency_code: String,
  /// Major-unit amount for display. Debtors include a leading minus (e.g. `-1,000`).
  pub amount_display: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtorCreditorPage {
  pub items: Vec<DebtorCreditorRow>,
  /// Row count for the requested side (all pages).
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
  /// Absolute sum for the requested side (compat with older clients).
  pub side_total_display: String,
  /// Absolute sum of all matching debtor balances (full filtered set).
  pub debtors_total_display: String,
  /// Sum of all matching creditor balances (full filtered set).
  pub creditors_total_display: String,
}

#[tauri::command]
pub fn list_debtors_creditors(
  state: State<'_, AppState>,
  input: ListDebtorsCreditorsInput,
) -> Result<DebtorCreditorPage, AppError> {
  let side = input.side.trim().to_ascii_uppercase();
  let debtors = match side.as_str() {
    "DEBTORS" => true,
    "CREDITORS" => false,
    _ => {
      return Err(AppError::Validation(
        "side must be DEBTORS or CREDITORS.".into(),
      ))
    }
  };

  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let include_totals = input.include_totals.unwrap_or(true);

  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| format!("%{s}%"));
  let currency = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());

  // Shared filter: customer wallets with non-zero cached balances (+ optional search/currency).
  // Side (debtor vs creditor) is applied only for the paginated list / side count.
  let mut base_sql = String::from(
    r#"FROM WalletCurrencyBalance b
       INNER JOIN Wallet w ON w.id = b.walletId AND w.type = 'CUSTOMER'
         AND w.deletedAt IS NULL AND w.isActive = 1
       INNER JOIN Customer c ON c.id = w.customerId AND c.deletedAt IS NULL
       INNER JOIN Currency cur ON cur.id = b.currencyId AND cur.deletedAt IS NULL
       WHERE ABS(b.balance) > 1e-9"#,
  );

  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
  if let Some(ref s) = search {
    base_sql.push_str(
      " AND (c.fullName LIKE ? OR IFNULL(c.code,'') LIKE ? OR IFNULL(c.phone,'') LIKE ?)",
    );
    params_v.push(Box::new(s.clone()));
    params_v.push(Box::new(s.clone()));
    params_v.push(Box::new(s.clone()));
  }
  if let Some(ref code) = currency {
    base_sql.push_str(" AND cur.code = ?");
    params_v.push(Box::new(code.clone()));
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "debtorsCreditors")?;

  let (debtors_total_display, creditors_total_display, side_total_display, total) =
    if include_totals {
      // One pass over the filtered set: both side totals + both side row counts.
      let agg_sql = format!(
        r#"SELECT
             COALESCE(SUM(CASE WHEN b.balance < -1e-9 THEN ABS(b.balance) ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN b.balance > 1e-9 THEN b.balance ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN b.balance < -1e-9 THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN b.balance > 1e-9 THEN 1 ELSE 0 END), 0)
           {base_sql}"#
      );
      let agg_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_v.iter().map(|p| p.as_ref()).collect();
      let (debtors_sum, creditors_sum, debtors_count, creditors_count): (f64, f64, i64, i64) =
        conn.query_row(&agg_sql, agg_refs.as_slice(), |row| {
          Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;

      let total = if debtors {
        debtors_count
      } else {
        creditors_count
      };
      let side_sum = if debtors {
        debtors_sum
      } else {
        creditors_sum
      };
      let debtors_total_display = format!("-{}", format_amount_commas(&format_f64(debtors_sum)));
      let creditors_total_display = format_amount_commas(&format_f64(creditors_sum));
      let side_total_display = if debtors {
        format!("-{}", format_amount_commas(&format_f64(side_sum)))
      } else {
        format_amount_commas(&format_f64(side_sum))
      };
      (
        debtors_total_display,
        creditors_total_display,
        side_total_display,
        total,
      )
    } else {
      (String::new(), String::new(), String::new(), 0)
    };

  let total = if include_totals {
    total
  } else {
    // Side row count still needed for pagination when totals skipped — lightweight COUNT only.
    let mut count_sql = base_sql.clone();
    if debtors {
      count_sql.push_str(" AND b.balance < -1e-9");
    } else {
      count_sql.push_str(" AND b.balance > 1e-9");
    }
    let count_sql = format!("SELECT COUNT(*) {count_sql}");
    let count_refs: Vec<&dyn rusqlite::types::ToSql> =
      params_v.iter().map(|p| p.as_ref()).collect();
    conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?
  };

  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let mut list_sql = base_sql.clone();
  if debtors {
    list_sql.push_str(" AND b.balance < -1e-9");
  } else {
    list_sql.push_str(" AND b.balance > 1e-9");
  }
  // Debtors are negative: balance ASC ≡ ABS(balance) DESC (most owed first).
  // Prefer bare column order so SQLite can use WalletCurrencyBalance_balance_idx.
  let order = if debtors {
    " ORDER BY b.balance ASC, c.fullName COLLATE NOCASE ASC, cur.code ASC"
  } else {
    " ORDER BY b.balance DESC, c.fullName COLLATE NOCASE ASC, cur.code ASC"
  };
  let list_sql = format!(
    "SELECT c.id, c.fullName, COALESCE(c.code, ''), cur.code, b.balance
     {list_sql}{order}
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let rows = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, f64>(4)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut items = Vec::with_capacity(rows.len());
  for (customer_id, customer_name, account_code, currency_code, bal) in rows {
    let abs = bal.abs();
    let amount = format_amount_commas(&format_f64(abs));
    items.push(DebtorCreditorRow {
      customer_id,
      customer_name,
      account_code,
      currency_code,
      // Negative sign = customer owes Sarafi (must pay back).
      amount_display: if debtors {
        format!("-{amount}")
      } else {
        amount
      },
    });
  }

  Ok(DebtorCreditorPage {
    items,
    total,
    page,
    page_size,
    side_total_display,
    debtors_total_display,
    creditors_total_display,
  })
}
