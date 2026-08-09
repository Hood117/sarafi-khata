//! Business cash overview — SQL SUM over VAULT + TILL wallets.

use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::ledger::money_from_major_units;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashBalanceRow {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub balance_display: String,
  pub amount_minor: String,
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

pub(crate) fn query_cash_balances(
  conn: &rusqlite::Connection,
) -> Result<Vec<CashBalanceRow>, AppError> {
  let mut wallet_stmt = conn.prepare(
    "SELECT id FROM Wallet
     WHERE deletedAt IS NULL AND isActive = 1 AND type IN ('VAULT','TILL')",
  )?;
  let wallet_ids: Vec<String> = wallet_stmt
    .query_map([], |row| row.get(0))?
    .collect::<Result<Vec<_>, _>>()?;

  if wallet_ids.is_empty() {
    return Ok(vec![]);
  }

  let placeholders = wallet_ids
    .iter()
    .map(|_| "?")
    .collect::<Vec<_>>()
    .join(",");
  let sql = format!(
    r#"SELECT c.code, c.symbol, c.decimalPlaces,
            CAST(COALESCE(SUM(
              CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
            ), 0) AS TEXT) AS netMajor
     FROM LedgerEntry le
     INNER JOIN "Transaction" tx
       ON tx.id = le.transactionId AND tx.deletedAt IS NULL
     INNER JOIN Currency c ON c.id = le.currencyId
     WHERE le.walletId IN ({placeholders})
       AND c.deletedAt IS NULL
     GROUP BY c.id, c.code, c.symbol, c.decimalPlaces
     HAVING ABS(COALESCE(SUM(
       CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
     ), 0)) > 0
     ORDER BY c.code ASC"#
  );

  let params: Vec<&dyn rusqlite::types::ToSql> = wallet_ids
    .iter()
    .map(|id| id as &dyn rusqlite::types::ToSql)
    .collect();

  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt
    .query_map(params.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, i64>(2)?,
        row.get::<_, String>(3)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut out = Vec::with_capacity(rows.len());
  for (code, symbol, places, net_major) in rows {
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
    let signed = if negative { -minor } else { minor };
    out.push(CashBalanceRow {
      currency_code: code,
      currency_symbol: symbol,
      balance_display: format_balance_display(signed, places),
      amount_minor: signed.to_string(),
    });
  }

  Ok(out)
}

#[tauri::command]
pub fn get_cash_balances(
  state: State<'_, AppState>,
) -> Result<Vec<CashBalanceRow>, AppError> {
  let conn = state.db.lock();
  query_cash_balances(&conn)
}
