//! Paginated transaction list — SQL WHERE + LIMIT/OFFSET.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

const DEFAULT_PAGE_SIZE: i64 = 25;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTransactionsInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub tx_type: Option<String>,
  pub search: Option<String>,
  pub customer_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionListItem {
  pub id: String,
  pub reference: String,
  pub r#type: String,
  pub status: String,
  pub customer_name: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub created_at: String,
  /// Money lines for this transaction, e.g. "USD 100 · AFN 7,000".
  pub amount_summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionListPage {
  pub items: Vec<TransactionListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_transactions_page(
  state: State<'_, AppState>,
  input: ListTransactionsInput,
) -> Result<TransactionListPage, AppError> {
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);

  let conn = state.db.lock();
  let mut where_sql = String::from("WHERE t.deletedAt IS NULL");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref t) = input.tx_type {
    let t = t.trim().to_ascii_uppercase();
    if !t.is_empty() && t != "ALL" {
      where_sql.push_str(" AND t.type = ?");
      params.push(Box::new(t));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND t.customerId = ?");
      params.push(Box::new(cid.to_string()));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.description,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
      let like = format!("%{q}%");
      params.push(Box::new(like.clone()));
      params.push(Box::new(like.clone()));
      params.push(Box::new(like));
    }
  }

  let count_sql = format!(
    "SELECT COUNT(*) FROM \"Transaction\" t
     LEFT JOIN Customer c ON c.id = t.customerId
     {where_sql}"
  );
  let param_refs: Vec<&dyn rusqlite::types::ToSql> =
    params.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))?;

  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let list_sql = format!(
    "SELECT t.id, t.reference, t.type, t.status, c.fullName, t.description, t.valueDate, t.createdAt
     FROM \"Transaction\" t
     LEFT JOIN Customer c ON c.id = t.customerId
     {where_sql}
     ORDER BY t.valueDate DESC, t.createdAt DESC
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let mut items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(TransactionListItem {
        id: row.get(0)?,
        reference: row.get(1)?,
        r#type: row.get(2)?,
        status: row.get(3)?,
        customer_name: row.get(4)?,
        description: row.get(5)?,
        value_date: row.get(6)?,
        created_at: row.get(7)?,
        amount_summary: String::new(),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if !items.is_empty() {
    let placeholders = items.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let money_sql = format!(
      r#"SELECT le.transactionId, c.code, le.direction,
                COALESCE(SUM(CAST(le.amount AS REAL)), 0)
         FROM LedgerEntry le
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE le.transactionId IN ({placeholders})
         GROUP BY le.transactionId, c.code, le.direction
         ORDER BY le.transactionId, c.code"#
    );
    let money_params: Vec<&dyn rusqlite::types::ToSql> = items
      .iter()
      .map(|i| &i.id as &dyn rusqlite::types::ToSql)
      .collect();
    let mut money_stmt = conn.prepare(&money_sql)?;
    let mut by_tx: std::collections::HashMap<String, Vec<String>> =
      std::collections::HashMap::new();
    for row in money_stmt.query_map(money_params.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })? {
      let (tx_id, code, direction, amount) = row?;
      let display = format_amount_display(&amount.to_string());
      let signed = if direction.eq_ignore_ascii_case("DEBIT") {
        format!("+ {code} {display}")
      } else {
        format!("− {code} {display}")
      };
      by_tx.entry(tx_id).or_default().push(signed);
    }
    for item in &mut items {
      item.amount_summary = by_tx
        .remove(&item.id)
        .map(|parts| parts.join(" · "))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".into());
    }
  }

  Ok(TransactionListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCustomerLedgerInput {
  pub customer_id: String,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerRow {
  pub id: String,
  pub reference: String,
  pub r#type: String,
  pub status: String,
  pub description: Option<String>,
  pub value_date: String,
  pub created_at: String,
  /// Human-readable activity (e.g. Money Added, Hawala).
  pub activity: String,
  /// Signed amount summary on the customer wallet, e.g. "+ USD 100 · − AFN 50".
  pub amount_summary: String,
  /// IN = customer balance up, OUT = down, MIXED = both, NONE = no wallet lines.
  pub flow: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerPage {
  pub items: Vec<CustomerLedgerRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn activity_label(tx_type: &str, reference: &str, description: Option<&str>) -> String {
  let ref_u = reference.to_ascii_uppercase();
  if ref_u.starts_with("OB-") || ref_u.starts_with("OPEN-WALLET") {
    return "Opening balance".into();
  }
  if ref_u.starts_with("MI-") || tx_type == "DEPOSIT" {
    return "Deposit (customer gave money)".into();
  }
  if ref_u.starts_with("MO-") || tx_type == "WITHDRAWAL" {
    return "Withdrawal (customer took money)".into();
  }
  match tx_type {
    "EXCHANGE" => "Currency exchange".into(),
    "HAWALA" => "Hawala".into(),
    "ADJUSTMENT" => description
      .map(|d| d.trim().to_string())
      .filter(|d| !d.is_empty())
      .unwrap_or_else(|| "Adjustment".into()),
    "TRANSFER" => "Transfer".into(),
    "TRADE_BUY" => "Trading purchase".into(),
    "TRADE_SELL" => "Trading sale".into(),
    other => other.to_string(),
  }
}

fn format_amount_display(raw: &str) -> String {
  let t = raw.trim();
  if t.is_empty() {
    return "0".into();
  }
  if let Ok(v) = t.parse::<f64>() {
    if (v - v.round()).abs() < 1e-9 {
      return format!("{}", v.round() as i64);
    }
    return format!("{v:.4}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string();
  }
  t.to_string()
}

#[tauri::command]
pub fn list_customer_ledger(
  state: State<'_, AppState>,
  input: ListCustomerLedgerInput,
) -> Result<CustomerLedgerPage, AppError> {
  let customer_id = input.customer_id.trim().to_string();
  if customer_id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);

  let conn = state.db.lock();
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM Customer WHERE id = ?1)",
    [&customer_id],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::NotFound("Customer not found.".into()));
  }

  let total: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT t.id)
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.customerId = ?1
         AND w.type = 'CUSTOMER'
         AND w.deletedAt IS NULL
       WHERE t.deletedAt IS NULL"#,
    [&customer_id],
    |row| row.get(0),
  )?;

  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let mut stmt = conn.prepare(
    r#"SELECT DISTINCT t.id, t.reference, t.type, t.status, t.description, t.valueDate, t.createdAt
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.customerId = ?1
         AND w.type = 'CUSTOMER'
         AND w.deletedAt IS NULL
       WHERE t.deletedAt IS NULL
       ORDER BY t.valueDate DESC, t.createdAt DESC
       LIMIT ?2 OFFSET ?3"#,
  )?;

  let headers = stmt
    .query_map(rusqlite::params![customer_id, page_size, offset], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, Option<String>>(4)?,
        row.get::<_, String>(5)?,
        row.get::<_, String>(6)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut items = Vec::with_capacity(headers.len());
  let mut line_stmt = conn.prepare(
    r#"SELECT c.code, le.direction, CAST(le.amount AS TEXT)
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId
       WHERE le.transactionId = ?2
       ORDER BY c.code, le.createdAt"#,
  )?;

  for (id, reference, tx_type, status, description, value_date, created_at) in headers {
    let lines = line_stmt
      .query_map(rusqlite::params![customer_id, id], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
        ))
      })?
      .collect::<Result<Vec<_>, _>>()?;

    let mut has_in = false;
    let mut has_out = false;
    let mut parts: Vec<String> = Vec::new();
    for (code, direction, amount) in &lines {
      let display = format_amount_display(amount);
      if direction.eq_ignore_ascii_case("DEBIT") {
        has_in = true;
        parts.push(format!("+ {code} {display}"));
      } else {
        has_out = true;
        parts.push(format!("− {code} {display}"));
      }
    }

    let flow = match (has_in, has_out) {
      (true, true) => "MIXED",
      (true, false) => "IN",
      (false, true) => "OUT",
      (false, false) => "NONE",
    }
    .to_string();

    let amount_summary = if parts.is_empty() {
      "—".into()
    } else {
      parts.join(" · ")
    };

    let mut activity = activity_label(&tx_type, &reference, description.as_deref());
    if tx_type == "TRANSFER" {
      activity = match (has_in, has_out) {
        (true, false) => "Transfer received".into(),
        (false, true) => "Transfer sent".into(),
        _ => "Transfer".into(),
      };
    }

    items.push(CustomerLedgerRow {
      activity,
      id,
      reference,
      r#type: tx_type,
      status,
      description,
      value_date,
      created_at,
      amount_summary,
      flow,
    });
  }

  Ok(CustomerLedgerPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTransactionInput {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionLedgerLine {
  pub id: String,
  pub wallet_name: String,
  pub wallet_type: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub direction: String,
  pub amount: String,
  pub memo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDetail {
  pub id: String,
  pub reference: String,
  pub r#type: String,
  pub status: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub walk_in_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub posted_at: Option<String>,
  pub created_at: String,
  pub activity: String,
  pub lines: Vec<TransactionLedgerLine>,
}

#[tauri::command]
pub fn get_transaction_detail(
  state: State<'_, AppState>,
  input: GetTransactionInput,
) -> Result<TransactionDetail, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Transaction id is required.".into()));
  }
  let conn = state.db.lock();

  let row = conn
    .query_row(
      r#"SELECT t.id, t.reference, t.type, t.status, t.customerId, c.fullName,
                t.walkInName, t.walkInPhone, t.description, t.valueDate,
                t.postedAt, t.createdAt
         FROM "Transaction" t
         LEFT JOIN Customer c ON c.id = t.customerId
         WHERE t.id = ?1 AND t.deletedAt IS NULL"#,
      [&id],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, String>(3)?,
          row.get::<_, Option<String>>(4)?,
          row.get::<_, Option<String>>(5)?,
          row.get::<_, Option<String>>(6)?,
          row.get::<_, Option<String>>(7)?,
          row.get::<_, Option<String>>(8)?,
          row.get::<_, String>(9)?,
          row.get::<_, Option<String>>(10)?,
          row.get::<_, String>(11)?,
        ))
      },
    )
    .map_err(|_| AppError::NotFound("Transaction not found.".into()))?;

  let (
    id,
    reference,
    tx_type,
    status,
    customer_id,
    customer_name,
    walk_in_name,
    walk_in_phone,
    description,
    value_date,
    posted_at,
    created_at,
  ) = row;

  let mut stmt = conn.prepare(
    r#"SELECT le.id, w.name, w.type, cur.code, cur.symbol, le.direction,
              CAST(le.amount AS TEXT), le.memo
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency cur ON cur.id = le.currencyId
       WHERE le.transactionId = ?1
       ORDER BY le.createdAt, w.name"#,
  )?;
  let lines = stmt
    .query_map([&id], |line| {
      let amount_raw: String = line.get(6)?;
      Ok(TransactionLedgerLine {
        id: line.get(0)?,
        wallet_name: line.get(1)?,
        wallet_type: line.get(2)?,
        currency_code: line.get(3)?,
        currency_symbol: line.get(4)?,
        direction: line.get(5)?,
        amount: format_amount_display(&amount_raw),
        memo: line.get(7)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(TransactionDetail {
    activity: activity_label(&tx_type, &reference, description.as_deref()),
    id,
    reference,
    r#type: tx_type,
    status,
    customer_id,
    customer_name,
    walk_in_name,
    walk_in_phone,
    description,
    value_date,
    posted_at,
    created_at,
    lines,
  })
}
