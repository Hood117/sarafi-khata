//! Currency catalog — list / create / update.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::authorize;
use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_sqlite;

const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCurrenciesInput {
  pub active_only: Option<bool>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyListItem {
  pub id: String,
  pub code: String,
  pub name: String,
  pub symbol: Option<String>,
  pub decimal_places: i64,
  pub is_active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyListPage {
  pub items: Vec<CurrencyListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn map_currency_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CurrencyListItem> {
  Ok(CurrencyListItem {
    id: row.get(0)?,
    code: row.get(1)?,
    name: row.get(2)?,
    symbol: row.get(3)?,
    decimal_places: row.get(4)?,
    is_active: row.get::<_, i64>(5)? != 0,
  })
}

fn load_currency_by_id(
  conn: &rusqlite::Connection,
  id: &str,
) -> Result<CurrencyListItem, AppError> {
  conn
    .query_row(
      "SELECT id, code, name, symbol, decimalPlaces, isActive
       FROM Currency WHERE id = ?1 AND deletedAt IS NULL",
      [id],
      map_currency_row,
    )
    .map_err(|_| AppError::NotFound("Currency not found.".into()))
}

#[tauri::command]
pub fn list_currencies_page(
  state: State<'_, AppState>,
  input: ListCurrenciesInput,
) -> Result<CurrencyListPage, AppError> {
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);
  let active_only = input.active_only.unwrap_or(true);

  let conn = state.db.lock();
  let _actor = authorize::require_auth(&state, &conn)?;
  let mut where_sql = String::from("WHERE deletedAt IS NULL");
  if active_only {
    where_sql.push_str(" AND isActive = 1");
  }

  let total: i64 = conn.query_row(
    &format!("SELECT COUNT(*) FROM Currency {where_sql}"),
    [],
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

  let mut stmt = conn.prepare(&format!(
    "SELECT id, code, name, symbol, decimalPlaces, isActive
     FROM Currency
     {where_sql}
     ORDER BY CASE
       WHEN UPPER(code) IN ('AFN','AF') THEN 0
       ELSE 1
     END, code ASC
     LIMIT ?1 OFFSET ?2"
  ))?;

  let items = stmt
    .query_map(rusqlite::params![page_size, offset], map_currency_row)?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(CurrencyListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCurrencyInput {
  pub code: String,
  pub name: String,
  pub symbol: Option<String>,
  pub decimal_places: Option<i64>,
  pub is_active: Option<bool>,
}

fn normalize_code(raw: &str) -> Result<String, AppError> {
  let code = raw.trim().to_ascii_uppercase();
  if code.len() < 3 || code.len() > 8 || !code.chars().all(|c| c.is_ascii_alphabetic()) {
    return Err(AppError::Validation(
      "Currency code must be 3–8 letters (A–Z).".into(),
    ));
  }
  Ok(code)
}

fn normalize_name(raw: &str) -> Result<String, AppError> {
  let name = raw.trim().to_string();
  if name.is_empty() {
    return Err(AppError::Validation("Currency name is required.".into()));
  }
  if name.len() > 100 {
    return Err(AppError::Validation(
      "Currency name must be at most 100 characters.".into(),
    ));
  }
  Ok(name)
}

fn normalize_symbol(raw: Option<String>) -> Result<Option<String>, AppError> {
  let Some(value) = raw else {
    return Ok(None);
  };
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if trimmed.len() > 16 {
    return Err(AppError::Validation(
      "Symbol must be at most 16 characters.".into(),
    ));
  }
  Ok(Some(trimmed))
}

#[tauri::command]
pub fn create_currency(
  state: State<'_, AppState>,
  input: CreateCurrencyInput,
) -> Result<CurrencyListItem, AppError> {
  let code = normalize_code(&input.code)?;
  let name = normalize_name(&input.name)?;
  let symbol = normalize_symbol(input.symbol)?;
  let places = input.decimal_places.unwrap_or(2).clamp(0, 6);
  let is_active = input.is_active.unwrap_or(true);
  let now = now_sqlite();

  let conn = state.db.lock();
  let _actor = authorize::require_settings(&state, &conn)?;

  let existing: Option<(String, Option<String>)> = conn
    .query_row(
      "SELECT id, deletedAt FROM Currency WHERE code = ?1 LIMIT 1",
      [&code],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;

  if let Some((id, deleted_at)) = existing {
    if deleted_at.is_none() {
      return Err(AppError::Validation(format!(
        "Currency {code} already exists."
      )));
    }
    conn.execute(
      r#"UPDATE Currency
         SET name = ?1, symbol = ?2, decimalPlaces = ?3,
             isActive = ?4, deletedAt = NULL, updatedAt = ?5
         WHERE id = ?6"#,
      params![name, symbol, places, if is_active { 1 } else { 0 }, now, id],
    )?;
    return load_currency_by_id(&conn, &id);
  }

  let id = uuid::Uuid::new_v4().to_string();
  conn.execute(
    r#"INSERT INTO Currency
       (id, code, name, symbol, decimalPlaces, isActive, deletedAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7)"#,
    params![
      id,
      code,
      name,
      symbol,
      places,
      if is_active { 1 } else { 0 },
      now
    ],
  )?;

  load_currency_by_id(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCurrencyInput {
  pub id: String,
  pub name: String,
  pub symbol: Option<String>,
  pub decimal_places: Option<i64>,
  pub is_active: Option<bool>,
}

#[tauri::command]
pub fn update_currency(
  state: State<'_, AppState>,
  input: UpdateCurrencyInput,
) -> Result<CurrencyListItem, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Currency id is required.".into()));
  }
  let name = normalize_name(&input.name)?;
  let symbol = normalize_symbol(input.symbol)?;
  let now = now_sqlite();

  let conn = state.db.lock();
  let _actor = authorize::require_settings(&state, &conn)?;
  let existing = load_currency_by_id(&conn, &id)?;
  let places = input
    .decimal_places
    .unwrap_or(existing.decimal_places)
    .clamp(0, 6);
  let is_active = input.is_active.unwrap_or(existing.is_active);

  let updated = conn.execute(
    r#"UPDATE Currency
       SET name = ?1, symbol = ?2, decimalPlaces = ?3, isActive = ?4, updatedAt = ?5
       WHERE id = ?6 AND deletedAt IS NULL"#,
    params![name, symbol, places, if is_active { 1 } else { 0 }, now, id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("Currency not found.".into()));
  }
  load_currency_by_id(&conn, &id)
}
