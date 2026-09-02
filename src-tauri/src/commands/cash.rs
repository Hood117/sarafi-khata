//! Main Vault physical cash overview — read-only SUM over the Main Vault ledger.

use serde::Serialize;
use tauri::State;

use crate::commands::authorize::require_any_screen;
use crate::error::AppError;
use crate::ledger::money_from_major_units;
use crate::state::AppState;

/// Preferred display order for desk cash (then remaining active currencies by code).
const CASH_CURRENCY_ORDER: &[&str] = &[
  "AFN", "USD", "EUR", "PKR", "AED", "SAR", "GBP", "QAR", "OMR",
];

/// Major-unit amount below this (and > 0) is treated as Low cash.
const LOW_CASH_MAJOR: i128 = 1_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashBalanceRow {
  pub currency_code: String,
  pub currency_name: String,
  pub currency_symbol: Option<String>,
  pub balance_display: String,
  pub amount_minor: String,
  /// `AVAILABLE` | `LOW` | `ZERO`
  pub condition: String,
}

fn format_balance_display(amount_minor: i128, decimal_places: i64) -> String {
  let negative = amount_minor < 0;
  let absolute = if negative { -amount_minor } else { amount_minor };
  let places = decimal_places.max(0) as usize;
  let digits = absolute.to_string();
  let padded = format!("{:0>width$}", digits, width = places + 1);
  let body = if places == 0 {
    padded
  } else {
    let split = padded.len() - places;
    let whole = &padded[..split];
    let mut frac = padded[split..].to_string();
    while frac.ends_with('0') {
      frac.pop();
    }
    if frac.is_empty() {
      whole.to_string()
    } else {
      format!("{whole}.{frac}")
    }
  };
  // thousands grouping on whole part
  let (signless, frac_part) = match body.split_once('.') {
    Some((w, f)) => (w.to_string(), Some(f.to_string())),
    None => (body, None),
  };
  let mut grouped = String::new();
  for (i, c) in signless.chars().rev().enumerate() {
    if i > 0 && i % 3 == 0 {
      grouped.push(',');
    }
    grouped.push(c);
  }
  let grouped: String = grouped.chars().rev().collect();
  let with_frac = match frac_part {
    Some(f) => format!("{grouped}.{f}"),
    None => grouped,
  };
  if negative {
    format!("-{with_frac}")
  } else {
    with_frac
  }
}

fn cash_condition(amount_minor: i128, decimal_places: i64) -> &'static str {
  if amount_minor == 0 {
    return "ZERO";
  }
  let places = decimal_places.max(0) as u32;
  let scale = 10_i128.pow(places);
  let major_abs = amount_minor.abs() / scale;
  if amount_minor < 0 || major_abs < LOW_CASH_MAJOR {
    "LOW"
  } else {
    "AVAILABLE"
  }
}

fn currency_sort_key(code: &str) -> (usize, String) {
  let upper = code.to_ascii_uppercase();
  let idx = CASH_CURRENCY_ORDER
    .iter()
    .position(|c| *c == upper.as_str())
    .unwrap_or(CASH_CURRENCY_ORDER.len());
  (idx, upper)
}

fn parse_net_major_to_minor(net_major: &str, places: i64) -> i128 {
  let trimmed = net_major.trim();
  let negative = trimmed.starts_with('-');
  let unsigned = if negative { &trimmed[1..] } else { trimmed };
  let minor = if unsigned.chars().all(|c| c == '0' || c == '.') {
    0
  } else {
    match money_from_major_units(unsigned, places) {
      Ok(v) => v,
      Err(_) => {
        let (whole, frac) = match unsigned.split_once('.') {
          Some((w, f)) => (w, f),
          None => (unsigned, ""),
        };
        let mut f = frac.to_string();
        while f.len() < places as usize {
          f.push('0');
        }
        format!("{whole}{f}").parse().unwrap_or(0)
      }
    }
  };
  if negative {
    -minor
  } else {
    minor
  }
}

/// Main Vault ledger balances for every active currency (zeros included).
pub(crate) fn query_cash_balances(
  conn: &rusqlite::Connection,
) -> Result<Vec<CashBalanceRow>, AppError> {
  let main_vault_id: Option<String> = conn
    .query_row(
      r#"SELECT id FROM Wallet
         WHERE deletedAt IS NULL AND isActive = 1
           AND type = 'VAULT' AND name = 'Main Vault'
         LIMIT 1"#,
      [],
      |row| row.get(0),
    )
    .ok();

  let sql = if main_vault_id.is_some() {
    // Prefer cached balances (O(currencies)) over full ledger SUM.
    r#"SELECT c.code, c.name, c.symbol, c.decimalPlaces,
              CAST(COALESCE(b.balance, 0) AS TEXT) AS netMajor
       FROM Currency c
       LEFT JOIN WalletCurrencyBalance b
         ON b.currencyId = c.id AND b.walletId = ?1
       WHERE c.deletedAt IS NULL AND c.isActive = 1
       GROUP BY c.id, c.code, c.name, c.symbol, c.decimalPlaces, b.balance"#
  } else {
    r#"SELECT c.code, c.name, c.symbol, c.decimalPlaces, '0' AS netMajor
       FROM Currency c
       WHERE c.deletedAt IS NULL AND c.isActive = 1
       GROUP BY c.id, c.code, c.name, c.symbol, c.decimalPlaces"#
  };

  let mut stmt = conn.prepare(sql)?;
  let rows = if let Some(ref vault_id) = main_vault_id {
    stmt
      .query_map(rusqlite::params![vault_id], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
          row.get::<_, i64>(3)?,
          row.get::<_, String>(4)?,
        ))
      })?
      .collect::<Result<Vec<_>, _>>()?
  } else {
    stmt
      .query_map([], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
          row.get::<_, i64>(3)?,
          row.get::<_, String>(4)?,
        ))
      })?
      .collect::<Result<Vec<_>, _>>()?
  };

  let mut out = Vec::with_capacity(rows.len());
  for (code, name, symbol, places, net_major) in rows {
    let signed = parse_net_major_to_minor(&net_major, places);
    // Cash page / overview: only physical cash currently held (> 0).
    if signed <= 0 {
      continue;
    }
    out.push(CashBalanceRow {
      currency_code: code,
      currency_name: name,
      currency_symbol: symbol,
      balance_display: format_balance_display(signed, places),
      amount_minor: signed.to_string(),
      condition: cash_condition(signed, places).to_string(),
    });
  }

  out.sort_by(|a, b| {
    currency_sort_key(&a.currency_code).cmp(&currency_sort_key(&b.currency_code))
  });

  Ok(out)
}

#[tauri::command]
pub fn get_cash_balances(
  state: State<'_, AppState>,
) -> Result<Vec<CashBalanceRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_any_screen(&state, &conn, &["cash", "vaults"])?;
  query_cash_balances(&conn)
}
