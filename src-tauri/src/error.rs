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

impl From<rusqlite::Error> for AppError {
  fn from(value: rusqlite::Error) -> Self {
    AppError::Db(value.to_string())
  }
}
