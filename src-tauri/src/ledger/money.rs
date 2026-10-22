//! Integer minor-unit money (no floating point).

use std::collections::HashMap;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LedgerDirection {
  Debit,
  Credit,
}

impl LedgerDirection {
  pub fn parse(value: &str) -> Result<Self, AppError> {
    match value.trim().to_ascii_uppercase().as_str() {
      "DEBIT" => Ok(Self::Debit),
      "CREDIT" => Ok(Self::Credit),
      _ => Err(AppError::Validation(
        "Ledger direction must be DEBIT or CREDIT.".into(),
      )),
    }
  }

  pub fn as_str(self) -> &'static str {
    match self {
      Self::Debit => "DEBIT",
      Self::Credit => "CREDIT",
    }
  }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Money {
  pub amount_minor: i128,
  pub currency: String,
}

pub fn parse_amount_minor(raw: &str) -> Result<i128, AppError> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err(AppError::Validation("Amount is required.".into()));
  }
  trimmed
    .parse::<i128>()
    .map_err(|_| AppError::Validation(format!("Invalid amountMinor: {raw}")))
}

/// Parse a major-unit decimal string (e.g. "12.50") into positive minor units.
pub fn money_from_major_units(major_amount: &str, decimal_places: i64) -> Result<i128, AppError> {
  let minor = money_from_major_units_allow_zero(major_amount, decimal_places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be greater than zero.".into()));
  }
  Ok(minor)
}

/// Like [`money_from_major_units`], but allows `0` (for COGS / empty inventory math).
/// Extra fractional digits beyond `decimal_places` are rounded half-up (not rejected),
/// so FX-derived amounts like `300.3334` can still be posted for a 3-decimal currency.
pub fn money_from_major_units_allow_zero(
  major_amount: &str,
  decimal_places: i64,
) -> Result<i128, AppError> {
  if !(0..=8).contains(&decimal_places) {
    return Err(AppError::Validation(
      "decimalPlaces must be an integer between 0 and 8.".into(),
    ));
  }
  let normalized = normalize_major_amount_input(major_amount);
  if !major_amount_ok(&normalized) {
    return Err(AppError::Validation(format!(
      "Invalid major-unit amount: \"{major_amount}\"."
    )));
  }

  let (whole_part, fraction_part) = match normalized.split_once('.') {
    Some((w, f)) => (w, f),
    None => (normalized.as_str(), ""),
  };

  let places = decimal_places as usize;
  let (whole_adj, frac_digits) = if fraction_part.len() <= places {
    let mut padded = fraction_part.to_string();
    while padded.len() < places {
      padded.push('0');
    }
    (whole_part.to_string(), padded)
  } else {
    // Round half-up using the next digit after the kept scale.
    let keep = &fraction_part[..places];
    let next = fraction_part.as_bytes()[places];
    let mut frac_num: i128 = if places == 0 {
      0
    } else {
      keep
        .parse()
        .map_err(|_| AppError::Validation(format!("Invalid amount: {major_amount}")))?
    };
    let mut whole_num: i128 = whole_part
      .parse()
      .map_err(|_| AppError::Validation(format!("Invalid amount: {major_amount}")))?;
    if next >= b'5' {
      if places == 0 {
        whole_num = whole_num.saturating_add(1);
      } else {
        frac_num = frac_num.saturating_add(1);
        let scale = 10_i128.pow(places as u32);
        if frac_num >= scale {
          frac_num = 0;
          whole_num = whole_num.saturating_add(1);
        }
      }
    }
    let frac_str = if places == 0 {
      String::new()
    } else {
      format!("{:0>width$}", frac_num, width = places)
    };
    (whole_num.to_string(), frac_str)
  };

  let combined = format!("{whole_adj}{frac_digits}");
  let minor: i128 = combined
    .parse()
    .map_err(|_| AppError::Validation(format!("Invalid amount: {major_amount}")))?;
  if minor < 0 {
    return Err(AppError::Validation("Amount must not be negative.".into()));
  }
  Ok(minor)
}

/// Parse inventory / balance major units that may include a leading `-`.
pub fn money_from_major_units_signed(
  major_amount: &str,
  decimal_places: i64,
) -> Result<i128, AppError> {
  let normalized = major_amount.trim();
  if let Some(rest) = normalized.strip_prefix('-') {
    let abs = money_from_major_units_allow_zero(rest, decimal_places)?;
    Ok(-abs)
  } else {
    money_from_major_units_allow_zero(normalized, decimal_places)
  }
}

/// Convert Pashto/Dari/Arabic digits and strip thousand separators before parse.
fn normalize_major_amount_input(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  let mut seen_dot = false;
  for ch in raw.trim().chars() {
    let mapped = match ch {
      '٠'..='٩' => char::from_u32(u32::from(ch) - 0x0660 + u32::from('0')),
      '۰'..='۹' => char::from_u32(u32::from(ch) - 0x06F0 + u32::from('0')),
      '٫' => Some('.'),
      ',' | '٬' | ' ' | '\u{00a0}' | '\u{202f}' | '\u{200e}' | '\u{200f}' => None,
      other => Some(other),
    };
    let Some(c) = mapped else { continue };
    if c.is_ascii_digit() {
      out.push(c);
      continue;
    }
    if c == '.' && !seen_dot {
      out.push('.');
      seen_dot = true;
    }
  }
  out
}

fn major_amount_ok(value: &str) -> bool {
  if value.is_empty() {
    return false;
  }
  let mut chars = value.chars();
  let Some(first) = chars.next() else {
    return false;
  };
  if !first.is_ascii_digit() {
    return false;
  }
  let mut seen_dot = false;
  for c in chars {
    if c == '.' {
      if seen_dot {
        return false;
      }
      seen_dot = true;
      continue;
    }
    if !c.is_ascii_digit() {
      return false;
    }
  }
  true
}

/// Convert positive minor units to a major-unit decimal string for SQLite Decimal columns.
pub fn money_to_major_unit_string(amount_minor: i128, decimal_places: i64) -> Result<String, AppError> {
  if !(0..=8).contains(&decimal_places) {
    return Err(AppError::Validation(
      "decimalPlaces must be an integer between 0 and 8.".into(),
    ));
  }
  if amount_minor < 0 {
    return Err(AppError::Validation(
      "Cannot persist a negative ledger amount; use direction for sign.".into(),
    ));
  }

  let places = decimal_places as usize;
  let digits = amount_minor.to_string();
  let padded = format!("{:0>width$}", digits, width = places + 1);

  if places == 0 {
    return Ok(padded);
  }

  let split_at = padded.len() - places;
  Ok(format!("{}.{}", &padded[..split_at], &padded[split_at..]))
}

/// Format a **wallet balance** for display (may be negative = customer owes Sarafi).
/// Never use this for LedgerEntry.amount — ledger amounts stay positive with direction.
pub fn signed_balance_to_display(amount_minor: i128, decimal_places: i64) -> Result<String, AppError> {
  if amount_minor < 0 {
    Ok(format!(
      "-{}",
      money_to_major_unit_string(-amount_minor, decimal_places)?
    ))
  } else {
    money_to_major_unit_string(amount_minor, decimal_places)
  }
}

#[derive(Debug, Clone)]
pub struct DomainEntry {
  pub wallet_id: String,
  pub currency: String,
  pub direction: LedgerDirection,
  pub amount_minor: i128,
  pub memo: Option<String>,
  pub exchange_rate_id: Option<String>,
}

pub fn assert_ledger_balanced(entries: &[DomainEntry]) -> Result<(), AppError> {
  let mut nets: HashMap<&str, i128> = HashMap::new();
  for entry in entries {
    if entry.amount_minor <= 0 {
      return Err(AppError::Validation(
        "Ledger amounts must be positive minor units.".into(),
      ));
    }
    let delta = match entry.direction {
      LedgerDirection::Debit => entry.amount_minor,
      LedgerDirection::Credit => -entry.amount_minor,
    };
    *nets.entry(entry.currency.as_str()).or_insert(0) += delta;
  }

  let unbalanced: Vec<_> = nets
    .iter()
    .filter(|(_, net)| **net != 0)
    .map(|(code, net)| format!("{code}: net={net}"))
    .collect();

  if !unbalanced.is_empty() {
    return Err(AppError::Validation(format!(
      "Ledger entries are not balanced per currency. {}",
      unbalanced.join("; ")
    )));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ledger_amount_rejects_negative() {
    assert!(money_to_major_unit_string(-100, 2).is_err());
  }

  #[test]
  fn signed_balance_display_allows_overdraft() {
    assert_eq!(signed_balance_to_display(200_000, 2).unwrap(), "2000.00");
    assert_eq!(signed_balance_to_display(-100_000, 2).unwrap(), "-1000.00");
    // 2000 withdraw 3000 → -1000
    let previous = 200_000i128;
    let withdraw = 300_000i128;
    assert_eq!(
      signed_balance_to_display(previous - withdraw, 2).unwrap(),
      "-1000.00"
    );
  }

  #[test]
  fn signed_major_units_round_trip() {
    assert_eq!(money_from_major_units_signed("1515", 0).unwrap(), 1515);
    assert_eq!(money_from_major_units_signed("-1515", 0).unwrap(), -1515);
    assert_eq!(money_from_major_units_allow_zero("0", 0).unwrap(), 0);
    assert!(money_from_major_units("0", 0).is_err());
    assert!(money_from_major_units("-1515", 0).is_err());
  }

  #[test]
  fn excess_decimals_round_half_up() {
    // 300.3334 → 300.333 at 3 places
    assert_eq!(money_from_major_units("300.3334", 3).unwrap(), 300_333);
    // 300.3335 → 300.334 at 3 places
    assert_eq!(money_from_major_units("300.3335", 3).unwrap(), 300_334);
    // 1.995 → 2.00 at 2 places
    assert_eq!(money_from_major_units("1.995", 2).unwrap(), 200);
    // 1.4 → 1 at 0 places
    assert_eq!(money_from_major_units("1.4", 0).unwrap(), 1);
    // 1.5 → 2 at 0 places
    assert_eq!(money_from_major_units("1.5", 0).unwrap(), 2);
  }
}
