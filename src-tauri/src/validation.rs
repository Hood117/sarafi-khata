//! Shared input validation (phone / amount format) for Tauri commands.

use crate::error::AppError;

/// Max stored phone string length (Customer.phone).
pub const PHONE_MAX_LENGTH: usize = 50;
/// Digit count after stripping separators.
pub const PHONE_MIN_DIGITS: usize = 7;
pub const PHONE_MAX_DIGITS: usize = 15;

fn to_western_digit(ch: char) -> Option<char> {
  let code = ch as u32;
  // ASCII
  if (b'0' as u32..=b'9' as u32).contains(&code) {
    return Some(ch);
  }
  // Arabic-Indic ٠-٩
  if (0x0660..=0x0669).contains(&code) {
    return Some(char::from_u32(b'0' as u32 + (code - 0x0660)).unwrap_or(ch));
  }
  // Extended Arabic-Indic (Persian/Pashto) ۰-۹
  if (0x06F0..=0x06F9).contains(&code) {
    return Some(char::from_u32(b'0' as u32 + (code - 0x06F0)).unwrap_or(ch));
  }
  // Fullwidth ０-９
  if (0xFF10..=0xFF19).contains(&code) {
    return Some(char::from_u32(b'0' as u32 + (code - 0xFF10)).unwrap_or(ch));
  }
  None
}

/// Westernize digits; keep +, space, dash; drop everything else.
pub fn normalize_phone_input(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  for ch in raw.chars() {
    if let Some(d) = to_western_digit(ch) {
      out.push(d);
      continue;
    }
    if ch == '+' || ch == ' ' || ch == '-' {
      out.push(ch);
    }
  }
  out
}

/// ASCII digits only.
pub fn phone_digits(raw: &str) -> String {
  raw.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// Loose phone format: digits/+ /space/dash; 7–15 digits; ≤ 50 chars.
pub fn is_valid_phone_format(raw: &str) -> bool {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return false;
  }
  if trimmed.chars().count() > PHONE_MAX_LENGTH {
    return false;
  }
  for ch in trimmed.chars() {
    if !(ch.is_ascii_digit() || ch == '+' || ch == ' ' || ch == '-') {
      return false;
    }
  }
  let digits = phone_digits(trimmed);
  let n = digits.len();
  (PHONE_MIN_DIGITS..=PHONE_MAX_DIGITS).contains(&n)
}

/// Optional phone: empty → None; otherwise must be valid. Returns trimmed display string.
pub fn validate_phone_optional(raw: Option<&str>) -> Result<Option<String>, AppError> {
  let Some(s) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
    return Ok(None);
  };
  // Accept Eastern digits by normalizing first for the format check display store.
  let normalized = normalize_phone_input(s);
  let trimmed = normalized.trim();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if !is_valid_phone_format(trimmed) {
    return Err(AppError::Validation(
      "Enter a valid phone (digits, spaces, + or -).".into(),
    ));
  }
  Ok(Some(trimmed.to_string()))
}

/// Required phone: non-empty and valid.
pub fn validate_phone_required(raw: Option<&str>) -> Result<String, AppError> {
  match validate_phone_optional(raw)? {
    Some(v) => Ok(v),
    None => Err(AppError::Validation("Phone is required.".into())),
  }
}

/// Required phone from a plain string field.
pub fn validate_phone_required_str(raw: &str) -> Result<String, AppError> {
  validate_phone_required(Some(raw))
}

/// Optional phone from a plain string field (empty → None).
pub fn validate_phone_optional_str(raw: &str) -> Result<Option<String>, AppError> {
  validate_phone_optional(Some(raw))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_loose_phones() {
    assert!(is_valid_phone_format("0700123456"));
    assert!(is_valid_phone_format("+93 700 123 456"));
    assert!(is_valid_phone_format("93-700-123456"));
    assert!(is_valid_phone_format("1234567"));
  }

  #[test]
  fn rejects_bad_phones() {
    assert!(!is_valid_phone_format(""));
    assert!(!is_valid_phone_format("123")); // too few digits
    assert!(!is_valid_phone_format("abc700123456"));
    assert!(!is_valid_phone_format("0700#123456"));
    assert!(!is_valid_phone_format(&"1".repeat(16))); // too many digits
  }

  #[test]
  fn normalizes_eastern_digits() {
    let n = normalize_phone_input("۰۷۰۰۱۲۳۴۵۶");
    assert_eq!(n, "0700123456");
    assert!(is_valid_phone_format(&n));
  }

  #[test]
  fn optional_empty_ok() {
    assert_eq!(validate_phone_optional(None).unwrap(), None);
    assert_eq!(validate_phone_optional(Some("  ")).unwrap(), None);
  }

  #[test]
  fn required_rejects_empty() {
    assert!(validate_phone_required(None).is_err());
    assert!(validate_phone_required(Some("")).is_err());
  }
}
