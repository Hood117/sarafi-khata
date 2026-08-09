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
  if !(0..=8).contains(&decimal_places) {
    return Err(AppError::Validation(
      "decimalPlaces must be an integer between 0 and 8.".into(),
    ));
  }
  let normalized = major_amount.trim();
  if !major_amount_ok(normalized) {
    return Err(AppError::Validation(format!(
      "Invalid major-unit amount: \"{major_amount}\"."
    )));
  }

  let (whole_part, fraction_part) = match normalized.split_once('.') {
    Some((w, f)) => (w, f),
    None => (normalized, ""),
  };
  if fraction_part.len() > decimal_places as usize {
    return Err(AppError::Validation(format!(
      "Amount has more than {decimal_places} decimal places."
    )));
  }
  let mut padded_fraction = fraction_part.to_string();
  while padded_fraction.len() < decimal_places as usize {
    padded_fraction.push('0');
  }
  let combined = format!("{whole_part}{padded_fraction}");
  let minor: i128 = combined
    .parse()
    .map_err(|_| AppError::Validation(format!("Invalid amount: {major_amount}")))?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be greater than zero.".into()));
  }
  Ok(minor)
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
