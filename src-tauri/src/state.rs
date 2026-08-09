//! Shared app state: SQLite connection used by Tauri commands.

use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
  pub db: Arc<Mutex<Connection>>,
  pub db_path: PathBuf,
}

impl AppState {
  pub fn with_connection(conn: Connection, db_path: PathBuf) -> Self {
    Self {
      db: Arc::new(Mutex::new(conn)),
      db_path,
    }
  }
}
