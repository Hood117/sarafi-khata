//! App locale preference — SystemSetting key `app.locale`.

use chrono::Utc;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

const LOCALE_KEY: &str = "app.locale";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleSetting {
  pub locale: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLocaleInput {
  pub locale: String,
}

fn normalize_locale(raw: &str) -> Result<String, AppError> {
  let v = raw.trim().to_ascii_lowercase();
  match v.as_str() {
    "en" | "fa" | "ps" => Ok(v),
    _ => Err(AppError::Validation(
      "locale must be en, fa (Dari), or ps (Pashto)".into(),
    )),
  }
}

#[tauri::command]
pub fn get_app_locale(state: State<'_, AppState>) -> Result<LocaleSetting, AppError> {
  let conn = state.db.lock();
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM SystemSetting WHERE key = ?1",
      [LOCALE_KEY],
      |row| row.get(0),
    )
    .optional()?;
  let locale = match value.as_deref() {
    Some(raw) => normalize_locale(raw).unwrap_or_else(|_| "en".into()),
    None => "en".into(),
  };
  Ok(LocaleSetting { locale })
}

#[tauri::command]
pub fn set_app_locale(
  state: State<'_, AppState>,
  input: SetLocaleInput,
) -> Result<LocaleSetting, AppError> {
  let locale = normalize_locale(&input.locale)?;
  let now = Utc::now().to_rfc3339();
  let conn = state.db.lock();

  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM SystemSetting WHERE key = ?1",
      [LOCALE_KEY],
      |row| row.get(0),
    )
    .optional()?;

  if let Some(id) = existing {
    conn.execute(
      "UPDATE SystemSetting SET value = ?1, updatedAt = ?2 WHERE id = ?3",
      rusqlite::params![locale, now, id],
    )?;
  } else {
    let id = Uuid::new_v4().to_string();
    conn.execute(
      "INSERT INTO SystemSetting (id, key, value, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5)",
      rusqlite::params![id, LOCALE_KEY, locale, now, now],
    )?;
  }

  Ok(LocaleSetting { locale })
}
