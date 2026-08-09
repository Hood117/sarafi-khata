//! Paginated wallet catalog — SQL LIMIT/OFFSET.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWalletsInput {
  /// Optional: CASH | CUSTOMER | SYSTEM | …
  pub wallet_type: Option<String>,
  pub active_only: Option<bool>,
  pub customer_id: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletListItem {
  pub id: String,
  pub name: String,
  pub r#type: String,
  pub customer_id: Option<String>,
  pub is_active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletListPage {
  pub items: Vec<WalletListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_wallets_page(
  state: State<'_, AppState>,
  input: ListWalletsInput,
) -> Result<WalletListPage, AppError> {
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);
  let active_only = input.active_only.unwrap_or(true);

  let conn = state.db.lock();
  let mut where_sql = String::from("WHERE deletedAt IS NULL");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if active_only {
    where_sql.push_str(" AND isActive = 1");
  }
  if let Some(ref t) = input.wallet_type {
    let t = t.trim().to_ascii_uppercase();
    if !t.is_empty() {
      where_sql.push_str(" AND type = ?");
      params.push(Box::new(t));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND customerId = ?");
      params.push(Box::new(cid.to_string()));
    }
  }

  let count_sql = format!("SELECT COUNT(*) FROM Wallet {where_sql}");
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
    "SELECT id, name, type, customerId, isActive
     FROM Wallet
     {where_sql}
     ORDER BY name ASC
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(WalletListItem {
        id: row.get(0)?,
        name: row.get(1)?,
        r#type: row.get(2)?,
        customer_id: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(WalletListPage {
    items,
    total,
    page,
    page_size,
  })
}
