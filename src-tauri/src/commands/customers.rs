//! Paginated customer list — SQL WHERE + LIMIT/OFFSET (never unbounded).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

const DEFAULT_PAGE_SIZE: i64 = 25;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCustomersInput {
  pub search: Option<String>,
  /// `active` | `archived` | `all`
  pub archive_filter: Option<String>,
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
  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let conn = state.db.lock();

  let mut where_sql = String::from("WHERE 1=1");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  match archive.as_str() {
    "archived" => where_sql.push_str(" AND deletedAt IS NOT NULL"),
    "all" => {}
    _ => where_sql.push_str(" AND deletedAt IS NULL"),
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
    "SELECT id, code, fullName, fatherName, phone, address, isActive, deletedAt, createdAt
     FROM Customer
     {where_sql}
     ORDER BY fullName ASC
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
      let deleted_at: Option<String> = row.get(7)?;
      Ok(CustomerListItem {
        id: row.get(0)?,
        code: row.get(1)?,
        full_name: row.get(2)?,
        father_name: row.get(3)?,
        phone: row.get(4)?,
        address: row.get(5)?,
        is_active: row.get::<_, i64>(6)? != 0,
        is_archived: deleted_at.is_some(),
        created_at: row.get(8)?,
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
pub struct CustomerDetail {
  pub id: String,
  pub code: Option<String>,
  pub full_name: String,
  pub father_name: Option<String>,
  pub phone: Option<String>,
  pub address: Option<String>,
  pub national_id: Option<String>,
  pub notes: Option<String>,
  pub is_active: bool,
  pub is_archived: bool,
  pub created_at: String,
  pub updated_at: String,
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
  let row = conn.query_row(
    "SELECT id, code, fullName, fatherName, phone, address, nationalId, notes,
            isActive, deletedAt, createdAt, updatedAt
     FROM Customer
     WHERE id = ?1
     LIMIT 1",
    [id],
    |row| {
      let deleted_at: Option<String> = row.get(9)?;
      Ok(CustomerDetail {
        id: row.get(0)?,
        code: row.get(1)?,
        full_name: row.get(2)?,
        father_name: row.get(3)?,
        phone: row.get(4)?,
        address: row.get(5)?,
        national_id: row.get(6)?,
        notes: row.get(7)?,
        is_active: row.get::<_, i64>(8)? != 0,
        is_archived: deleted_at.is_some(),
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
      })
    },
  );

  match row {
    Ok(v) => Ok(v),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::NotFound("Customer not found.".into()))
    }
    Err(e) => Err(e.into()),
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
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM Customer WHERE id = ?1)",
    [&customer_id],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::NotFound("Customer not found.".into()));
  }

  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS bal
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
       GROUP BY c.id, c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map([&customer_id], |row| {
      let code: String = row.get(0)?;
      let symbol: Option<String> = row.get(1)?;
      let bal: f64 = row.get(2)?;
      let display = if (bal - bal.round()).abs() < 1e-9 {
        format!("{}", bal.round() as i64)
      } else {
        format!("{bal:.4}")
          .trim_end_matches('0')
          .trim_end_matches('.')
          .to_string()
      };
      Ok(CustomerBalanceRow {
        currency_code: code,
        currency_symbol: symbol,
        balance_display: display,
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
  let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let sql = format!(
    r#"SELECT w.customerId, c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS bal
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId IN ({placeholders})
         AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
       GROUP BY w.customerId, c.id, c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
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
