//! Optional shop-cash / Main Vault tracking (SystemSetting `app.cashTracking`).
//!
//! When off, customer/partner ledger ops still post claim legs, but Main Vault
//! cash legs and vault sufficiency checks are skipped.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppError;

pub const CASH_TRACKING_KEY: &str = "app.cashTracking";

fn read_cash_tracking_raw(conn: &Connection) -> Result<Option<String>, AppError> {
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
        [CASH_TRACKING_KEY],
        |row| row.get(0),
      )
      .optional()?,
  )
}

/// Default is **on** (existing Main Vault behavior) when the setting is missing.
pub fn is_cash_tracking_enabled(conn: &Connection) -> Result<bool, AppError> {
  match read_cash_tracking_raw(conn)? {
    None => Ok(true),
    Some(raw) => {
      let v = raw.trim().to_ascii_lowercase();
      Ok(matches!(v.as_str(), "on" | "true" | "1" | "yes"))
    }
  }
}

pub fn normalize_cash_tracking(raw: &str) -> Result<&'static str, AppError> {
  match raw.trim().to_ascii_lowercase().as_str() {
    "on" | "true" | "1" | "yes" => Ok("on"),
    "off" | "false" | "0" | "no" => Ok("off"),
    _ => Err(AppError::Validation(
      "cashTracking must be on or off.".into(),
    )),
  }
}
