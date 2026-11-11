//! Archive retention: after 30 days archived, hide the customer from archive lists
//! (`purgedAt`) while keeping the row + name for Daybook / search history.

use rusqlite::Connection;

use crate::error::AppError;
use crate::util::now_sqlite;

/// Days an archived customer remains restorable in the Archive list.
pub const CUSTOMER_ARCHIVE_RETENTION_DAYS: i64 = 30;

/// Soft-purge archived customers older than [`CUSTOMER_ARCHIVE_RETENTION_DAYS`].
/// Does **not** touch transactions, ledger rows, or customer name/code/phone.
pub fn purge_expired_archived_customers(conn: &Connection) -> Result<u64, AppError> {
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE Customer
       SET purgedAt = ?1, updatedAt = ?1
       WHERE deletedAt IS NOT NULL
         AND purgedAt IS NULL
         AND datetime(deletedAt) <= datetime('now', ?2)"#,
    rusqlite::params![
      now,
      format!("-{CUSTOMER_ARCHIVE_RETENTION_DAYS} days")
    ],
  )?;
  if updated > 0 {
    log::info!("purged {updated} archived customer(s) past {CUSTOMER_ARCHIVE_RETENTION_DAYS}-day retention");
  }
  Ok(updated as u64)
}

#[cfg(test)]
mod tests {
  use super::*;
  use rusqlite::params;

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
      r#"
      CREATE TABLE Customer (
        id TEXT PRIMARY KEY,
        fullName TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        deletedAt TEXT,
        purgedAt TEXT,
        updatedAt TEXT
      );
      "#,
    )
    .unwrap();
    conn
  }

  #[test]
  fn purge_skips_recent_archive() {
    let conn = setup();
    conn.execute(
      "INSERT INTO Customer (id, fullName, isActive, deletedAt, purgedAt, updatedAt)
       VALUES ('c1', 'Recent', 0, datetime('now', '-5 days'), NULL, datetime('now'))",
      [],
    )
    .unwrap();
    let n = purge_expired_archived_customers(&conn).unwrap();
    assert_eq!(n, 0);
    let purged: Option<String> = conn
      .query_row("SELECT purgedAt FROM Customer WHERE id='c1'", [], |r| r.get(0))
      .unwrap();
    assert!(purged.is_none());
  }

  #[test]
  fn purge_marks_old_archive() {
    let conn = setup();
    conn.execute(
      "INSERT INTO Customer (id, fullName, isActive, deletedAt, purgedAt, updatedAt)
       VALUES ('c2', 'Old', 0, datetime('now', '-31 days'), NULL, datetime('now'))",
      [],
    )
    .unwrap();
    let n = purge_expired_archived_customers(&conn).unwrap();
    assert_eq!(n, 1);
    let purged: Option<String> = conn
      .query_row("SELECT purgedAt FROM Customer WHERE id='c2'", [], |r| r.get(0))
      .unwrap();
    assert!(purged.is_some());
    // Name preserved for Daybook search.
    let name: String = conn
      .query_row("SELECT fullName FROM Customer WHERE id='c2'", [], |r| r.get(0))
      .unwrap();
    assert_eq!(name, "Old");
  }

  #[test]
  fn purge_is_idempotent() {
    let conn = setup();
    conn.execute(
      "INSERT INTO Customer (id, fullName, isActive, deletedAt, purgedAt, updatedAt)
       VALUES ('c3', 'Already', 0, datetime('now', '-40 days'), datetime('now', '-1 days'), datetime('now'))",
      [],
    )
    .unwrap();
    let before: String = conn
      .query_row("SELECT purgedAt FROM Customer WHERE id='c3'", [], |r| r.get(0))
      .unwrap();
    let n = purge_expired_archived_customers(&conn).unwrap();
    assert_eq!(n, 0);
    let after: String = conn
      .query_row("SELECT purgedAt FROM Customer WHERE id='c3'", [], |r| r.get(0))
      .unwrap();
    assert_eq!(before, after);
  }

  #[test]
  fn purge_ignores_active_customers() {
    let conn = setup();
    conn
      .execute(
        "INSERT INTO Customer (id, fullName, isActive, deletedAt, purgedAt, updatedAt)
         VALUES (?1, 'Live', 1, NULL, NULL, datetime('now'))",
        params!["c4"],
      )
      .unwrap();
    assert_eq!(purge_expired_archived_customers(&conn).unwrap(), 0);
  }
}
