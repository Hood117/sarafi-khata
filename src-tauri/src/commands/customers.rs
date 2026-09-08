//! Paginated customer list — SQL WHERE + LIMIT/OFFSET (never unbounded).

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{money_from_major_units, money_to_major_unit_string};
use crate::state::AppState;
use crate::commands::authorize::{require_screen};

const DEFAULT_PAGE_SIZE: i64 = 25;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCustomersInput {
  pub search: Option<String>,
  /// `active` | `archived` | `all`
  pub archive_filter: Option<String>,
  /// `permanent` | `temporary` | `all`
  pub type_filter: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerListItem {
  pub id: String,
  pub code: Option<String>,
  pub full_name: String,
  pub father_name: Option<String>,
  pub phone: Option<String>,
  pub address: Option<String>,
  /// `PERMANENT` | `TEMPORARY`
  pub customer_type: String,
  pub is_active: bool,
  pub is_archived: bool,
  pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerListPage {
  pub items: Vec<CustomerListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn normalize_page(page: i64) -> i64 {
  if page < 1 {
    1
  } else {
    page
  }
}

fn normalize_page_size(size: i64) -> i64 {
  if size < 1 {
    DEFAULT_PAGE_SIZE
  } else {
    size.min(MAX_PAGE_SIZE)
  }
}

#[tauri::command]
pub fn list_customers_page(
  state: State<'_, AppState>,
  input: ListCustomersInput,
) -> Result<CustomerListPage, AppError> {
  let page_size = normalize_page_size(input.page_size.unwrap_or(DEFAULT_PAGE_SIZE));
  let mut page = normalize_page(input.page.unwrap_or(1));
  let archive = input
    .archive_filter
    .as_deref()
    .unwrap_or("active")
    .to_ascii_lowercase();
  let type_filter = input
    .type_filter
    .as_deref()
    .unwrap_or("all")
    .to_ascii_lowercase();
  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "customers")?;

  let mut where_sql = String::from("WHERE 1=1");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  match archive.as_str() {
    "archived" => where_sql.push_str(" AND deletedAt IS NOT NULL"),
    "all" => {}
    _ => where_sql.push_str(" AND deletedAt IS NULL"),
  }

  match type_filter.as_str() {
    "temporary" | "temp" => {
      where_sql.push_str(" AND UPPER(IFNULL(customerType, 'PERMANENT')) = 'TEMPORARY'")
    }
    "permanent" => {
      where_sql.push_str(" AND UPPER(IFNULL(customerType, 'PERMANENT')) = 'PERMANENT'")
    }
    _ => {}
  }

  if let Some(ref q) = search {
    where_sql.push_str(
      " AND (
         fullName LIKE ?
         OR IFNULL(fatherName,'') LIKE ?
         OR IFNULL(phone,'') LIKE ?
         OR IFNULL(code,'') LIKE ?
         OR IFNULL(nationalId,'') LIKE ?
         OR IFNULL(address,'') LIKE ?
         OR IFNULL(notes,'') LIKE ?
       )",
    );
    let like = format!("%{q}%");
    for _ in 0..7 {
      params.push(Box::new(like.clone()));
    }
  }

  let count_sql = format!("SELECT COUNT(*) FROM Customer {where_sql}");
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
    "SELECT id, code, fullName, fatherName, phone, address,
            IFNULL(customerType, 'PERMANENT'), isActive, deletedAt, createdAt
     FROM Customer
     {where_sql}
     ORDER BY
       CASE
         WHEN code IS NULL OR TRIM(code) = '' THEN 1
         WHEN CAST(code AS INTEGER) > 0 AND CAST(code AS INTEGER) = CAST(code AS REAL) THEN 0
         ELSE 1
       END,
       CAST(code AS INTEGER) ASC,
       fullName COLLATE NOCASE ASC
     LIMIT ? OFFSET ?"
  );

  let mut list_params: Vec<Box<dyn rusqlite::types::ToSql>> = params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      let deleted_at: Option<String> = row.get(8)?;
      Ok(CustomerListItem {
        id: row.get(0)?,
        code: row.get(1)?,
        full_name: row.get(2)?,
        father_name: row.get(3)?,
        phone: row.get(4)?,
        address: row.get(5)?,
        customer_type: row.get(6)?,
        is_active: row.get::<_, i64>(7)? != 0,
        is_archived: deleted_at.is_some(),
        created_at: row.get(9)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(CustomerListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCustomerInput {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningKataLineDetail {
  pub transaction_id: String,
  pub currency_code: String,
  pub amount: String,
  /// `GIVE` = customer gave money | `TAKE` = customer took money
  pub direction: String,
  pub description: String,
  pub notes: Option<String>,
  pub value_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerDetail {
  pub id: String,
  pub code: Option<String>,
  pub full_name: String,
  pub father_name: Option<String>,
  pub phone: Option<String>,
  pub address: Option<String>,
  pub national_id: Option<String>,
  pub notes: Option<String>,
  /// `PERMANENT` | `TEMPORARY`
  pub customer_type: String,
  pub is_active: bool,
  pub is_archived: bool,
  pub created_at: String,
  pub updated_at: String,
  pub opening_kata: Vec<OpeningKataLineDetail>,
  pub linked_partner_sarafi_id: Option<String>,
  pub linked_partner_name: Option<String>,
}

fn format_opening_amount_display(major: &str) -> String {
  let t = major.trim();
  if t.is_empty() {
    return String::new();
  }
  if let Ok(v) = t.parse::<f64>() {
    if (v - v.round()).abs() < 1e-9 {
      return format!("{}", v.round() as i64);
    }
    return format!("{v:.8}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string();
  }
  t.to_string()
}

fn iso_date_prefix(value_date: &str) -> String {
  let trimmed = value_date.trim();
  if trimmed.len() >= 10 {
    trimmed[..10].to_string()
  } else {
    trimmed.to_string()
  }
}

/// Load Opening Kata ledger rows (OB-* transactions) for edit forms.
pub fn load_customer_opening_kata(
  conn: &Connection,
  customer_id: &str,
) -> Result<Vec<OpeningKataLineDetail>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT t.id, t.valueDate, IFNULL(t.description, ''),
              c.code, le.direction, CAST(le.amount AS TEXT), c.decimalPlaces
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.customerId = t.customerId
         AND w.type = 'CUSTOMER'
         AND w.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE t.customerId = ?1
         AND t.deletedAt IS NULL
         AND UPPER(t.reference) LIKE 'OB-%'
         AND (
           le.memo LIKE 'Opening Kata — money in%'
           OR le.memo LIKE 'Opening Kata — money out%'
         )
       ORDER BY t.displaySeq IS NULL, t.displaySeq ASC, t.createdAt ASC, t.rowid ASC"#,
  )?;
  let rows = stmt
    .query_map([customer_id], |row| {
      let transaction_id: String = row.get(0)?;
      let value_date: String = row.get(1)?;
      let description: String = row.get(2)?;
      let currency_code: String = row.get(3)?;
      let direction: String = row.get(4)?;
      let amount: String = row.get(5)?;
      let decimal_places: i64 = row.get(6)?;
      Ok((
        transaction_id,
        value_date,
        description,
        currency_code,
        direction,
        amount,
        decimal_places,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut items = Vec::with_capacity(rows.len());
  for (
    transaction_id,
    value_date,
    description,
    currency_code,
    direction,
    amount,
    decimal_places,
  ) in rows
  {
    let direction_norm = direction.trim().to_ascii_uppercase();
    let kata_direction = if direction_norm == "DEBIT" {
      "GIVE"
    } else if direction_norm == "CREDIT" {
      "TAKE"
    } else {
      continue;
    };
    let minor = money_from_major_units(amount.trim(), decimal_places)?;
    let amount_display = format_opening_amount_display(
      &money_to_major_unit_string(minor, decimal_places).unwrap_or(amount),
    );
    items.push(OpeningKataLineDetail {
      transaction_id,
      currency_code,
      amount: amount_display,
      direction: kata_direction.into(),
      description,
      notes: None,
      value_date: iso_date_prefix(&value_date),
    });
  }
  Ok(items)
}

#[tauri::command]
pub fn get_customer(
  state: State<'_, AppState>,
  input: GetCustomerInput,
) -> Result<CustomerDetail, AppError> {
  let id = input.id.trim();
  if id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "customers")?;
  let row = conn.query_row(
    "SELECT id, code, fullName, fatherName, phone, address, nationalId, notes,
            IFNULL(customerType, 'PERMANENT'), isActive, deletedAt, createdAt, updatedAt
     FROM Customer
     WHERE id = ?1
     LIMIT 1",
    [id],
    |row| {
      let deleted_at: Option<String> = row.get(10)?;
      Ok((
        row.get::<_, String>(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get::<_, String>(8)?,
        row.get::<_, i64>(9)? != 0,
        deleted_at.is_some(),
        row.get(11)?,
        row.get(12)?,
      ))
    },
  );

  match row {
    Ok((
      id,
      code,
      full_name,
      father_name,
      phone,
      address,
      national_id,
      notes,
      customer_type,
      is_active,
      is_archived,
      created_at,
      updated_at,
    )) => {
      let opening_kata = load_customer_opening_kata(&conn, &id)?;
      let linked_partner: Option<(String, String)> = conn
        .query_row(
          "SELECT id, name FROM PartnerSarafi
           WHERE customerId = ?1 AND deletedAt IS NULL
           LIMIT 1",
          [&id],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
      Ok(CustomerDetail {
        id,
        code,
        full_name,
        father_name,
        phone,
        address,
        national_id,
        notes,
        customer_type,
        is_active,
        is_archived,
        created_at,
        updated_at,
        opening_kata,
        linked_partner_sarafi_id: linked_partner.as_ref().map(|(pid, _)| pid.clone()),
        linked_partner_name: linked_partner.map(|(_, name)| name),
      })
    }
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::NotFound("Customer not found.".into()))
    }
    Err(e) => Err(e.into()),
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPreviousCustomerInput {
  /// When set, return the customer created just before this id (for Previous in the form).
  pub before_id: Option<String>,
}

/// Most recently created active customer, or the one before `beforeId` when editing.
#[tauri::command]
pub fn get_previous_customer(
  state: State<'_, AppState>,
  input: GetPreviousCustomerInput,
) -> Result<Option<CustomerDetail>, AppError> {
  let before = input
    .before_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let previous_id: Option<String> = {
    let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "customers")?;
    if let Some(ref bid) = before {
      conn
        .query_row(
          r#"SELECT id FROM Customer
             WHERE deletedAt IS NULL
               AND (
                 createdAt < (SELECT createdAt FROM Customer WHERE id = ?1)
                 OR (
                   createdAt = (SELECT createdAt FROM Customer WHERE id = ?1)
                   AND id < ?1
                 )
               )
             ORDER BY createdAt DESC, id DESC
             LIMIT 1"#,
          [bid],
          |row| row.get(0),
        )
        .optional()?
    } else {
      conn
        .query_row(
          r#"SELECT id FROM Customer
             WHERE deletedAt IS NULL
             ORDER BY createdAt DESC, id DESC
             LIMIT 1"#,
          [],
          |row| row.get(0),
        )
        .optional()?
    }
  };

  match previous_id {
    Some(id) => get_customer(state, GetCustomerInput { id }).map(Some),
    None => Ok(None),
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBalanceRow {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub balance_display: String,
}

#[tauri::command]
pub fn get_customer_balances(
  state: State<'_, AppState>,
  customer_id: String,
) -> Result<Vec<CustomerBalanceRow>, AppError> {
  let customer_id = customer_id.trim().to_string();
  if customer_id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "customers")?;
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM Customer WHERE id = ?1)",
    [&customer_id],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::NotFound("Customer not found.".into()));
  }

  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(b.balance, 0) AS bal
       FROM Wallet w
       INNER JOIN WalletCurrencyBalance b ON b.walletId = w.id
       INNER JOIN Currency c ON c.id = b.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
         AND ABS(COALESCE(b.balance, 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map([&customer_id], |row| {
      let code: String = row.get(0)?;
      let symbol: Option<String> = row.get(1)?;
      let bal: f64 = row.get(2)?;
      Ok(CustomerBalanceRow {
        currency_code: code,
        currency_symbol: symbol,
        balance_display: format_balance_display(bal),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

fn format_balance_display(bal: f64) -> String {
  if (bal - bal.round()).abs() < 1e-9 {
    format!("{}", bal.round() as i64)
  } else {
    format!("{bal:.4}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string()
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBalancesBatchItem {
  pub customer_id: String,
  pub balances: Vec<CustomerBalanceRow>,
}

#[tauri::command]
pub fn get_customers_balances_batch(
  state: State<'_, AppState>,
  customer_ids: Vec<String>,
) -> Result<Vec<CustomerBalancesBatchItem>, AppError> {
  let mut ids: Vec<String> = customer_ids
    .into_iter()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .collect();
  ids.sort();
  ids.dedup();
  if ids.len() > 100 {
    ids.truncate(100);
  }
  if ids.is_empty() {
    return Ok(Vec::new());
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "customers")?;
  let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let sql = format!(
    r#"SELECT w.customerId, c.code, c.symbol, COALESCE(b.balance, 0) AS bal
       FROM Wallet w
       INNER JOIN WalletCurrencyBalance b ON b.walletId = w.id
       INNER JOIN Currency c ON c.id = b.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId IN ({placeholders})
         AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
         AND ABS(COALESCE(b.balance, 0)) > 1e-9
       ORDER BY w.customerId, c.code"#
  );
  let params: Vec<&dyn rusqlite::types::ToSql> =
    ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
  let mut stmt = conn.prepare(&sql)?;
  let mut map: std::collections::HashMap<String, Vec<CustomerBalanceRow>> =
    std::collections::HashMap::new();
  for row in stmt.query_map(params.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })? {
    let (cid, code, symbol, bal) = row?;
    map.entry(cid).or_default().push(CustomerBalanceRow {
      currency_code: code,
      currency_symbol: symbol,
      balance_display: format_balance_display(bal),
    });
  }

  Ok(
    ids
      .into_iter()
      .map(|customer_id| {
        let balances = map.remove(&customer_id).unwrap_or_default();
        CustomerBalancesBatchItem {
          customer_id,
          balances,
        }
      })
      .collect(),
  )
}
