//! Shared time / string helpers for commands and ledger.

/// UTC timestamp string matching SQLite DATETIME storage used across the desk.
pub fn now_sqlite() -> String {
  chrono::Utc::now()
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string()
}

/// Local calendar date `YYYY-MM-DD`.
pub fn today_local() -> String {
  chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Trim and format a float for display (drop trailing zeros).
pub fn format_f64(v: f64) -> String {
  if !v.is_finite() {
    return "0".into();
  }
  if (v - v.round()).abs() < 1e-9 {
    format!("{}", v.round() as i64)
  } else {
    format!("{v:.4}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string()
  }
}

pub fn require_nonempty(value: &str, field: &str) -> Result<String, crate::error::AppError> {
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Err(crate::error::AppError::Validation(format!(
      "{field} is required."
    )));
  }
  Ok(trimmed)
}

pub fn trim_opt(value: Option<String>) -> Option<String> {
  value.and_then(|v| {
    let t = v.trim().to_string();
    if t.is_empty() {
      None
    } else {
      Some(t)
    }
  })
}

pub fn trim_opt_max(
  value: Option<String>,
  max: usize,
) -> Result<Option<String>, crate::error::AppError> {
  let Some(raw) = value else {
    return Ok(None);
  };
  let trimmed = raw.trim().to_string();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if trimmed.len() > max {
    return Err(crate::error::AppError::Validation(format!(
      "Value must be at most {max} characters."
    )));
  }
  Ok(Some(trimmed))
}
