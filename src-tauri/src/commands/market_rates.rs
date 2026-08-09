//! Internet market FX rates — reference only.
//!
//! HTTP is done in the Rates page WebView (avoids ring/rustls MSVC build issues).
//! Rust only stores/reads the SQLite cache. Never used by exchange posting.

use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_sqlite;

const CACHE_ID: &str = "default";
const PROVIDER_NAME: &str = "exchangerate-api.com (open access)";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketRateRow {
  pub code: String,
  pub name: Option<String>,
  pub rate: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRatesSnapshot {
  pub base_code: String,
  pub fetched_at: Option<String>,
  pub provider: String,
  pub provider_time: Option<String>,
  pub rates: Vec<MarketRateRow>,
  pub has_cache: bool,
  pub last_error: Option<String>,
  pub refreshed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRatesConfig {
  pub base_code: String,
  pub currency_codes: Vec<String>,
  pub fetch_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMarketRatesInput {
  pub base_code: String,
  pub payload: Value,
  pub provider_time: Option<String>,
  pub last_error: Option<String>,
}

fn empty_snapshot(error: Option<String>) -> MarketRatesSnapshot {
  MarketRatesSnapshot {
    base_code: "USD".into(),
    fetched_at: None,
    provider: PROVIDER_NAME.into(),
    provider_time: None,
    rates: Vec::new(),
    has_cache: false,
    last_error: error,
    refreshed: false,
  }
}

fn active_currency_codes(conn: &Connection) -> Result<Vec<(String, String)>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT code, name FROM Currency
       WHERE deletedAt IS NULL AND isActive = 1
       ORDER BY code ASC"#,
  )?;
  let rows = stmt
    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

fn pick_base_code(codes: &[(String, String)]) -> String {
  if codes.iter().any(|(c, _)| c.eq_ignore_ascii_case("AFN")) {
    return "AFN".into();
  }
  if codes.iter().any(|(c, _)| c.eq_ignore_ascii_case("USD")) {
    return "USD".into();
  }
  codes
    .first()
    .map(|(c, _)| c.clone())
    .unwrap_or_else(|| "USD".into())
}

type CacheRow = (
  String,
  String,
  String,
  Option<String>,
  String,
  Option<String>,
);

fn read_cache_row(conn: &Connection) -> Result<Option<CacheRow>, AppError> {
  let row = conn
    .query_row(
      r#"SELECT baseCode, fetchedAt, provider, providerTime, payloadJson, lastError
         FROM MarketRateCache WHERE id = ?1"#,
      [CACHE_ID],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, Option<String>>(3)?,
          row.get::<_, String>(4)?,
          row.get::<_, Option<String>>(5)?,
        ))
      },
    )
    .optional()?;
  Ok(row)
}

fn build_rows_from_payload(
  payload: &Value,
  desk_currencies: &[(String, String)],
) -> Vec<MarketRateRow> {
  let Some(rates_obj) = payload.get("rates").and_then(|v| v.as_object()) else {
    return Vec::new();
  };
  let name_by_code: BTreeMap<String, String> = desk_currencies
    .iter()
    .map(|(c, n)| (c.to_ascii_uppercase(), n.clone()))
    .collect();

  let mut out = Vec::new();
  for (code, name) in desk_currencies {
    let key = code.to_ascii_uppercase();
    if let Some(rate_val) = rates_obj.get(&key).or_else(|| rates_obj.get(code)) {
      let rate = match rate_val {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => continue,
      };
      out.push(MarketRateRow {
        code: key.clone(),
        name: name_by_code.get(&key).cloned().or_else(|| Some(name.clone())),
        rate,
      });
    }
  }

  // Provider rates are "units of CODE per 1 BASE". Include base as 1 so the UI
  // can convert any selected currency against the rest of the desk list.
  if let Some(base) = payload
    .get("base_code")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_ascii_uppercase())
    .filter(|s| s.len() == 3)
  {
    if !out.iter().any(|r| r.code == base) {
      if let Some((_, name)) = desk_currencies
        .iter()
        .find(|(c, _)| c.eq_ignore_ascii_case(&base))
      {
        out.push(MarketRateRow {
          code: base,
          name: Some(name.clone()),
          rate: "1".into(),
        });
      }
    }
  }

  out.sort_by(|a, b| a.code.cmp(&b.code));
  out
}

fn snapshot_from_cache(
  conn: &Connection,
  refreshed: bool,
  overlay_error: Option<String>,
) -> Result<MarketRatesSnapshot, AppError> {
  let desk = active_currency_codes(conn)?;
  let Some((base, fetched_at, provider, provider_time, payload_json, last_error)) =
    read_cache_row(conn)?
  else {
    return Ok(empty_snapshot(overlay_error));
  };
  let payload: Value = serde_json::from_str(&payload_json).unwrap_or(Value::Null);
  let rates = build_rows_from_payload(&payload, &desk);
  Ok(MarketRatesSnapshot {
    base_code: base,
    fetched_at: Some(fetched_at),
    provider,
    provider_time,
    rates,
    has_cache: true,
    last_error: overlay_error.or(last_error),
    refreshed,
  })
}

fn upsert_cache(
  conn: &Connection,
  base: &str,
  provider: &str,
  provider_time: Option<&str>,
  payload_json: &str,
  last_error: Option<&str>,
) -> Result<(), AppError> {
  let now = now_sqlite();
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM MarketRateCache WHERE id = ?1)",
    [CACHE_ID],
    |row| row.get(0),
  )?;
  if exists {
    conn.execute(
      r#"UPDATE MarketRateCache
         SET baseCode=?1, fetchedAt=?2, provider=?3, providerTime=?4,
             payloadJson=?5, lastError=?6
         WHERE id=?7"#,
      params![
        base,
        now,
        provider,
        provider_time,
        payload_json,
        last_error,
        CACHE_ID
      ],
    )?;
  } else {
    conn.execute(
      r#"INSERT INTO MarketRateCache
         (id, baseCode, fetchedAt, provider, providerTime, payloadJson, lastError)
         VALUES (?1,?2,?3,?4,?5,?6,?7)"#,
      params![
        CACHE_ID,
        base,
        now,
        provider,
        provider_time,
        payload_json,
        last_error
      ],
    )?;
  }
  Ok(())
}

/// Preferred base + fetch URL for the Rates page (no network).
#[tauri::command]
pub fn get_market_rates_config(
  state: State<'_, AppState>,
) -> Result<MarketRatesConfig, AppError> {
  let conn = state.db.lock();
  let desk = active_currency_codes(&conn)?;
  let base = pick_base_code(&desk);
  Ok(MarketRatesConfig {
    fetch_url: format!("https://open.er-api.com/v6/latest/{base}"),
    base_code: base,
    currency_codes: desk.into_iter().map(|(c, _)| c).collect(),
  })
}

/// Local cache only — never opens a network connection.
#[tauri::command]
pub fn get_cached_market_rates(
  state: State<'_, AppState>,
) -> Result<MarketRatesSnapshot, AppError> {
  let conn = state.db.lock();
  snapshot_from_cache(&conn, false, None)
}

/// Persist a payload fetched by the Rates page WebView.
#[tauri::command]
pub fn save_market_rates_cache(
  state: State<'_, AppState>,
  input: SaveMarketRatesInput,
) -> Result<MarketRatesSnapshot, AppError> {
  let base = input.base_code.trim().to_ascii_uppercase();
  if base.len() != 3 {
    return Err(AppError::Validation("baseCode must be a 3-letter currency.".into()));
  }

  let conn = state.db.lock();
  if let Some(err) = input.last_error.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    // Failed refresh: keep previous payload if any, stamp error.
    if let Some((base_c, _fetched, provider, provider_time, payload_json, _)) =
      read_cache_row(&conn)?
    {
      upsert_cache(
        &conn,
        &base_c,
        &provider,
        provider_time.as_deref(),
        &payload_json,
        Some(err),
      )?;
      return snapshot_from_cache(&conn, false, Some(err.to_string()));
    }
    return Ok(empty_snapshot(Some(err.to_string())));
  }

  let result = input
    .payload
    .get("result")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  if result != "success" {
    let msg = input
      .payload
      .get("error-type")
      .and_then(|v| v.as_str())
      .unwrap_or("provider returned an error");
    return Err(AppError::Validation(format!("Market rates provider error: {msg}")));
  }

  let provider_time = input
    .provider_time
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .or_else(|| {
      input
        .payload
        .get("time_last_update_utc")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    });

  let payload_json = serde_json::to_string(&input.payload)
    .map_err(|e| AppError::Internal(format!("serialize market rates: {e}")))?;

  upsert_cache(
    &conn,
    &base,
    PROVIDER_NAME,
    provider_time.as_deref(),
    &payload_json,
    None,
  )?;
  snapshot_from_cache(&conn, true, None)
}
