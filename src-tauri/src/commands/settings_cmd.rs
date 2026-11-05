//! App settings — locale, business name, and UI text prefs (SystemSetting keys).

use chrono::Utc;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::authorize::{require_auth, require_settings};
use crate::error::AppError;
use crate::state::AppState;

const LOCALE_KEY: &str = "app.locale";
const BUSINESS_NAME_KEY: &str = "app.name";
const DEFAULT_BUSINESS_NAME: &str = "Radefy Sarafi Offline";
const FONT_SIZE_KEY: &str = "app.ui.fontSize";
const FONT_FAMILY_KEY: &str = "app.ui.fontFamily";
const BOLD_TEXT_KEY: &str = "app.ui.boldText";
const THEME_KEY: &str = "app.ui.theme";
const DEFAULT_FONT_SIZE: &str = "default";
const DEFAULT_FONT_FAMILY: &str = "default";
const DEFAULT_THEME: &str = "light";

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessNameSetting {
  pub business_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBusinessNameInput {
  pub business_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UiTextPrefs {
  pub font_size: String,
  pub font_family: String,
  pub bold_text: bool,
  pub theme: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetUiTextPrefsInput {
  pub font_size: String,
  pub bold_text: bool,
  pub theme: Option<String>,
  pub font_family: Option<String>,
}

fn normalize_font_size(raw: &str) -> Result<String, AppError> {
  let v = raw.trim().to_ascii_lowercase().replace('_', "-");
  match v.as_str() {
    "small" | "default" | "large" | "extra-large" => Ok(v),
    "extralarge" | "xl" | "extra large" => Ok("extra-large".into()),
    _ => Err(AppError::Validation(
      "fontSize must be small, default, large, or extra-large".into(),
    )),
  }
}

fn normalize_font_family(raw: &str) -> Result<String, AppError> {
  match raw.trim().to_ascii_lowercase().as_str() {
    // Legacy Tajawal/Cairo prefs map to the single Arabic UI font.
    "default" | "tajawal" | "tajawol" | "cairo" => Ok(DEFAULT_FONT_FAMILY.into()),
    _ => Err(AppError::Validation("fontFamily must be default".into())),
  }
}

fn normalize_theme(raw: &str) -> Result<String, AppError> {
  match raw.trim().to_ascii_lowercase().as_str() {
    "light" | "dark" => Ok(raw.trim().to_ascii_lowercase()),
    _ => Err(AppError::Validation("theme must be light or dark".into())),
  }
}

fn read_ui_text_prefs(conn: &rusqlite::Connection) -> Result<UiTextPrefs, AppError> {
  let font_size = match read_setting(conn, FONT_SIZE_KEY)? {
    Some(raw) => normalize_font_size(&raw).unwrap_or_else(|_| DEFAULT_FONT_SIZE.into()),
    None => DEFAULT_FONT_SIZE.into(),
  };
  let font_family = match read_setting(conn, FONT_FAMILY_KEY)? {
    Some(raw) => normalize_font_family(&raw).unwrap_or_else(|_| DEFAULT_FONT_FAMILY.into()),
    None => DEFAULT_FONT_FAMILY.into(),
  };
  let bold_text = match read_setting(conn, BOLD_TEXT_KEY)? {
    Some(raw) => {
      let v = raw.trim().to_ascii_lowercase();
      v == "true" || v == "1" || v == "yes" || v == "on"
    }
    None => false,
  };
  let theme = match read_setting(conn, THEME_KEY)? {
    Some(raw) => normalize_theme(&raw).unwrap_or_else(|_| DEFAULT_THEME.into()),
    None => DEFAULT_THEME.into(),
  };
  Ok(UiTextPrefs {
    font_size,
    font_family,
    bold_text,
    theme,
  })
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

pub(crate) fn read_setting(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='SystemSetting')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(None);
  }
  Ok(
    conn
      .query_row(
        "SELECT value FROM SystemSetting WHERE key = ?1",
        [key],
        |row| row.get(0),
      )
      .optional()?,
  )
}

pub(crate) fn upsert_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='SystemSetting')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::Db(
      "SystemSetting table missing — restart the app to repair schema.".into(),
    ));
  }
  let now = Utc::now().to_rfc3339();
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM SystemSetting WHERE key = ?1",
      [key],
      |row| row.get(0),
    )
    .optional()?;

  if let Some(id) = existing {
    conn.execute(
      "UPDATE SystemSetting SET value = ?1, updatedAt = ?2 WHERE id = ?3",
      rusqlite::params![value, now, id],
    )?;
  } else {
    let id = Uuid::new_v4().to_string();
    conn.execute(
      "INSERT INTO SystemSetting (id, key, value, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5)",
      rusqlite::params![id, key, value, now, now],
    )?;
  }
  Ok(())
}

pub fn resolve_business_name(conn: &rusqlite::Connection) -> Result<String, AppError> {
  let value = read_setting(conn, BUSINESS_NAME_KEY)?;
  let name = value
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(DEFAULT_BUSINESS_NAME);
  Ok(name.to_string())
}

/// Open before login (locale for Login UI).
#[tauri::command]
pub fn get_app_locale(state: State<'_, AppState>) -> Result<LocaleSetting, AppError> {
  // Open before login (locale for Login UI).
  let conn = state.db.lock();
  let value = read_setting(&conn, LOCALE_KEY)?;
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
  let conn = state.db.lock();
  let _actor = require_settings(&state, &conn)?;
  upsert_setting(&conn, LOCALE_KEY, &locale)?;
  Ok(LocaleSetting { locale })
}

#[tauri::command]
pub fn get_business_name(state: State<'_, AppState>) -> Result<BusinessNameSetting, AppError> {
  let conn = state.db.lock();
  let _actor = require_auth(&state, &conn)?;
  Ok(BusinessNameSetting {
    business_name: resolve_business_name(&conn)?,
  })
}

#[tauri::command]
pub fn set_business_name(
  state: State<'_, AppState>,
  input: SetBusinessNameInput,
) -> Result<BusinessNameSetting, AppError> {
  let name = input.business_name.trim().to_string();
  if name.is_empty() {
    return Err(AppError::Validation("Business name is required.".into()));
  }
  if name.len() > 120 {
    return Err(AppError::Validation(
      "Business name must be 120 characters or fewer.".into(),
    ));
  }
  let conn = state.db.lock();
  let _actor = require_settings(&state, &conn)?;
  upsert_setting(&conn, BUSINESS_NAME_KEY, &name)?;
  Ok(BusinessNameSetting {
    business_name: name,
  })
}

/// Open before login (font prefs for Login UI).
#[tauri::command]
pub fn get_ui_text_prefs(state: State<'_, AppState>) -> Result<UiTextPrefs, AppError> {
  let conn = state.db.lock();
  read_ui_text_prefs(&conn)
}

#[tauri::command]
pub fn set_ui_text_prefs(
  state: State<'_, AppState>,
  input: SetUiTextPrefsInput,
) -> Result<UiTextPrefs, AppError> {
  let font_size = normalize_font_size(&input.font_size)?;
  let bold_text = input.bold_text;
  let theme = normalize_theme(
    input
      .theme
      .as_deref()
      .unwrap_or(DEFAULT_THEME),
  )?;
  let font_family = normalize_font_family(
    input
      .font_family
      .as_deref()
      .unwrap_or(DEFAULT_FONT_FAMILY),
  )?;
  let conn = state.db.lock();
  let _actor = require_settings(&state, &conn)?;
  upsert_setting(&conn, FONT_SIZE_KEY, &font_size)?;
  upsert_setting(&conn, FONT_FAMILY_KEY, &font_family)?;
  upsert_setting(
    &conn,
    BOLD_TEXT_KEY,
    if bold_text { "true" } else { "false" },
  )?;
  upsert_setting(&conn, THEME_KEY, &theme)?;
  Ok(UiTextPrefs {
    font_size,
    font_family,
    bold_text,
    theme,
  })
}
