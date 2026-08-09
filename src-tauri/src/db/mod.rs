//! SQLite connection bootstrap (WAL + safe pragmas).

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

use crate::error::AppError;

pub fn open_database(path: &Path) -> Result<Connection, AppError> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| {
      AppError::Io(format!("create db directory {}: {e}", parent.display()))
    })?;
  }

  let conn = Connection::open_with_flags(
    path,
    OpenFlags::SQLITE_OPEN_READ_WRITE
      | OpenFlags::SQLITE_OPEN_CREATE
      | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
  )
  .map_err(|e| AppError::Db(format!("open {}: {e}", path.display())))?;

  apply_pragmas(&conn)?;
  Ok(conn)
}

fn apply_pragmas(conn: &Connection) -> Result<(), AppError> {
  // Match the Node Prisma client pragmas used in production.
  conn
    .execute_batch(
      "
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
      ",
    )
    .map_err(|e| AppError::Db(format!("pragma: {e}")))?;
  Ok(())
}
