//! Ledger-derived wallet balances via SQL SUM (never load all rows).

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::ledger::money::money_from_major_units;

/// Asset convention: DEBIT +, CREDIT −. Returns net minor units for one wallet+currency.
pub fn wallet_currency_balance_minor(
  conn: &Connection,
  wallet_id: &str,
  currency_id: &str,
  decimal_places: i64,
) -> Result<i128, AppError> {
  let net_major: String = conn.query_row(
    r#"SELECT CAST(COALESCE(SUM(
       CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END
     ), 0) AS TEXT)
     FROM LedgerEntry le
     INNER JOIN "Transaction" tx
       ON tx.id = le.transactionId AND tx.deletedAt IS NULL
     WHERE le.walletId = ?1 AND le.currencyId = ?2"#,
    params![wallet_id, currency_id],
    |row| row.get(0),
  )?;

  let trimmed = net_major.trim();
  if trimmed.is_empty() || trimmed == "0" {
    return Ok(0);
  }

  let negative = trimmed.starts_with('-');
  let unsigned = if negative { &trimmed[1..] } else { trimmed };
  if unsigned.chars().all(|c| c == '0' || c == '.') {
    return Ok(0);
  }

  let minor = match money_from_major_units(unsigned, decimal_places) {
    Ok(v) => v,
    Err(_) => major_to_minor_allow_zero(unsigned, decimal_places)?,
  };
  Ok(if negative { -minor } else { minor })
}

fn major_to_minor_allow_zero(major: &str, decimal_places: i64) -> Result<i128, AppError> {
  let (whole, frac) = match major.split_once('.') {
    Some((w, f)) => (w, f),
    None => (major, ""),
  };
  if frac.len() > decimal_places as usize {
    return Err(AppError::Validation("Invalid balance scale.".into()));
  }
  let mut f = frac.to_string();
  while f.len() < decimal_places as usize {
    f.push('0');
  }
  format!("{whole}{f}")
    .parse()
    .map_err(|_| AppError::Validation("Invalid balance amount.".into()))
}

pub fn find_currency_by_code(
  conn: &Connection,
  code: &str,
) -> Result<(String, String, i64), AppError> {
  let code = code.trim().to_ascii_uppercase();
  conn
    .query_row(
      "SELECT id, code, decimalPlaces FROM Currency
       WHERE code = ?1 AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [&code],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound(format!("Currency was not found: {code}."))
      }
      other => other.into(),
    })
}
