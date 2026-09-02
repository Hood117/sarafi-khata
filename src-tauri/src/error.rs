//! App-level errors returned to the WebView as strings.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
  #[error("{0}")]
  Db(String),
  #[error("{0}")]
  Io(String),
  #[error("{0}")]
  Auth(String),
  #[error("{0}")]
  Validation(String),
  #[error("{0}")]
  NotFound(String),
  #[error("{0}")]
  Internal(String),
}

impl Serialize for AppError {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

/// Classify a SQLite/rusqlite error for the SPA while keeping the raw text.
/// Financial writes must never auto-retry; the UI may offer a safe user retry.
pub fn classify_sqlite_error(value: &rusqlite::Error) -> AppError {
  let text = value.to_string();
  log::error!("sqlite error: {text}");
  AppError::Db(classify_sqlite_text(&text))
}

fn classify_sqlite_text(text: &str) -> String {
  let lower = text.to_lowercase();
  if lower.contains("database is locked")
    || lower.contains("database is busy")
    || lower.contains("sqlite_busy")
    || lower.contains("sqlite_locked")
  {
    return format!("DATABASE_BUSY: {text}");
  }
  if (lower.contains("unique constraint") || lower.contains("constraint failed"))
    && lower.contains("transaction.reference")
  {
    // Application bug if a new post reuses an existing reference (e.g. Previous/Repeat).
    // Do not hide the cause — keep the raw SQLite text after the code.
    return format!("UNIQUE_TX_REFERENCE: {text}");
  }
  if lower.contains("foreign key") {
    return format!("SQLITE_FK: {text}");
  }
  if lower.contains("unique constraint")
    || lower.contains("constraint failed")
    || lower.contains("sqlite_constraint")
  {
    return format!("SQLITE_CONSTRAINT: {text}");
  }
  if lower.contains("unable to open database")
    || lower.contains("disk i/o error")
    || lower.contains("database disk image is malformed")
    || lower.contains("not a database")
  {
    return format!("DATABASE_UNAVAILABLE: {text}");
  }
  text.to_string()
}

impl From<rusqlite::Error> for AppError {
  fn from(value: rusqlite::Error) -> Self {
    classify_sqlite_error(&value)
  }
}

#[cfg(test)]
mod tests {
  use super::classify_sqlite_text;

  #[test]
  fn classifies_busy() {
    let out = classify_sqlite_text("database is locked");
    assert!(out.starts_with("DATABASE_BUSY:"), "{out}");
  }

  #[test]
  fn classifies_unique_transaction_reference() {
    let out = classify_sqlite_text("UNIQUE constraint failed: Transaction.reference");
    assert!(
      out.starts_with("UNIQUE_TX_REFERENCE:"),
      "must not hide Previous/Repeat reference reuse: {out}"
    );
    assert!(out.contains("Transaction.reference"), "{out}");
  }

  #[test]
  fn classifies_foreign_key() {
    let out = classify_sqlite_text("FOREIGN KEY constraint failed");
    assert!(out.starts_with("SQLITE_FK:"), "{out}");
  }

  #[test]
  fn classifies_generic_unique() {
    let out = classify_sqlite_text("UNIQUE constraint failed: Customer.phone");
    assert!(out.starts_with("SQLITE_CONSTRAINT:"), "{out}");
  }
}
