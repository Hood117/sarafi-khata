//! Permanent human-friendly transaction numbers (DEP-0001, WD-0002, …).
//! Separate from Transaction.reference — never reuse, never reset.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;

pub const DISPLAY_SEQ_TABLE: &str = "TransactionDisplaySequence";

/// Oldest-first creation order for `"Transaction" t`.
/// `displaySeq` is the global post sequence (not per-type voucher numbers).
/// `createdAt` + `rowid` only break remaining ties (legacy NULL seq).
pub const TX_CHRONO_ASC: &str =
  "t.displaySeq IS NULL, t.displaySeq ASC, t.createdAt ASC, t.rowid ASC";

/// Newest-first, still stable by the same global creation sequence.
pub const TX_CHRONO_DESC: &str =
  "t.displaySeq IS NULL, t.displaySeq DESC, t.createdAt DESC, t.rowid DESC";

/// Hawala lists joined as `HawalaTransfer h LEFT JOIN "Transaction" t`.
pub const HAWALA_CHRONO_ASC: &str =
  "t.displaySeq IS NULL, t.displaySeq ASC, h.createdAt ASC, h.rowid ASC";

pub const HAWALA_CHRONO_DESC: &str =
  "t.displaySeq IS NULL, t.displaySeq DESC, h.createdAt DESC, h.rowid DESC";

/// Prefix for the user-facing number. Uses existing type / internal reference
/// category — does not invent new financial transaction types.
pub fn display_prefix(tx_type: &str, internal_ref: &str) -> &'static str {
  let r = internal_ref.trim().to_ascii_uppercase();
  if r.starts_with("OB-") || r.starts_with("OPEN-WALLET") {
    return "OB";
  }
  if r.starts_with("CASH-IN") {
    return "CIN";
  }
  if r.starts_with("CASH-OUT") {
    return "COUT";
  }
  if r.starts_with("SAL-") {
    return "SAL";
  }
  if r.starts_with("CAP-") {
    return "CAP";
  }
  match tx_type.trim().to_ascii_uppercase().as_str() {
    "DEPOSIT" => "DEP",
    "WITHDRAWAL" => "WD",
    "TRANSFER" => "TR",
    "EXCHANGE" => "EX",
    "HAWALA" => "HW",
    "EXPENSE" => "EXP",
    "TRADE_BUY" => "TB",
    "TRADE_SELL" => "TS",
    "VAULT_CASH_IN" => "CIN",
    "VAULT_CASH_OUT" => "COUT",
    "ADJUSTMENT" => "ADJ",
    _ => "TX",
  }
}

/// 1 → 0001, 9999 → 9999, 10000 → 10000 (no daily/yearly reset).
pub fn format_display_number(seq: i64) -> String {
  let n = seq.max(1);
  if n < 10_000 {
    format!("{n:04}")
  } else {
    n.to_string()
  }
}

pub fn format_display_ref(seq: i64, tx_type: &str, internal_ref: &str) -> String {
  format!(
    "{}-{}",
    display_prefix(tx_type, internal_ref),
    format_display_number(seq)
  )
}

pub fn resolve_display_ref(
  stored: Option<&str>,
  seq: Option<i64>,
  tx_type: &str,
  internal_ref: &str,
) -> String {
  if let Some(s) = stored.map(str::trim).filter(|s| !s.is_empty()) {
    return s.to_string();
  }
  if let Some(n) = seq.filter(|n| *n > 0) {
    return format_display_ref(n, tx_type, internal_ref);
  }
  String::new()
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
    [name],
    |row| row.get(0),
  )?;
  Ok(exists)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
  let mut stmt = conn
    .prepare(&format!(r#"PRAGMA table_info("{table}")"#))
    .map_err(|e| AppError::Db(format!("pragma table_info {table}: {e}")))?;
  let names = stmt
    .query_map([], |row| row.get::<_, String>(1))?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(names.iter().any(|n| n == column))
}

/// Sequence table, columns, unique indexes, chronological backfill.
/// Safe on every open. Does not change Transaction.reference.
pub fn ensure_display_seq_schema(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "Transaction")? {
    return Ok(());
  }

  conn
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "TransactionDisplaySequence" (
        "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
        "next" INTEGER NOT NULL
      );
      "#,
    )
    .map_err(|e| AppError::Db(format!("TransactionDisplaySequence: {e}")))?;

  if !column_exists(conn, "Transaction", "displaySeq")? {
    conn
      .execute_batch(r#"ALTER TABLE "Transaction" ADD COLUMN "displaySeq" INTEGER;"#)
      .map_err(|e| AppError::Db(format!("add displaySeq: {e}")))?;
  }
  if !column_exists(conn, "Transaction", "displayRef")? {
    conn
      .execute_batch(r#"ALTER TABLE "Transaction" ADD COLUMN "displayRef" TEXT;"#)
      .map_err(|e| AppError::Db(format!("add displayRef: {e}")))?;
  }

  backfill_missing_display_numbers(conn)?;

  let _ = conn.execute_batch(
    r#"
    CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_displaySeq_key"
      ON "Transaction"("displaySeq") WHERE "displaySeq" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_displayRef_key"
      ON "Transaction"("displayRef") WHERE "displayRef" IS NOT NULL;
    "#,
  );

  sync_sequence_next(conn)?;
  Ok(())
}

fn max_display_seq(conn: &Connection) -> Result<i64, AppError> {
  let max: Option<i64> = conn
    .query_row(
      r#"SELECT MAX("displaySeq") FROM "Transaction""#,
      [],
      |row| row.get(0),
    )
    .optional()?
    .flatten();
  Ok(max.unwrap_or(0))
}

fn sync_sequence_next(conn: &Connection) -> Result<(), AppError> {
  let min_next = max_display_seq(conn)?.saturating_add(1).max(1);
  let has_row: bool = conn.query_row(
    r#"SELECT EXISTS(SELECT 1 FROM "TransactionDisplaySequence" WHERE id = 1)"#,
    [],
    |row| row.get(0),
  )?;
  if !has_row {
    conn.execute(
      r#"INSERT INTO "TransactionDisplaySequence" ("id", "next") VALUES (1, ?1)"#,
      [min_next],
    )?;
  } else {
    let current: i64 = conn.query_row(
      r#"SELECT "next" FROM "TransactionDisplaySequence" WHERE id = 1"#,
      [],
      |row| row.get(0),
    )?;
    if current < min_next {
      conn.execute(
        r#"UPDATE "TransactionDisplaySequence" SET "next" = ?1 WHERE id = 1"#,
        [min_next],
      )?;
    }
  }
  Ok(())
}

fn backfill_missing_display_numbers(conn: &Connection) -> Result<(), AppError> {
  let mut next = max_display_seq(conn)?.saturating_add(1).max(1);
  let mut stmt = conn.prepare(
    r#"SELECT id, type, reference, displaySeq FROM "Transaction"
       WHERE displaySeq IS NULL OR displayRef IS NULL OR TRIM(IFNULL(displayRef,'')) = ''
       ORDER BY datetime(createdAt) ASC, createdAt ASC, id ASC"#,
  )?;
  let rows: Vec<(String, String, String, Option<i64>)> = stmt
    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
    .collect::<Result<Vec<_>, _>>()?;
  drop(stmt);

  for (id, tx_type, reference, existing_seq) in rows {
    let seq = match existing_seq.filter(|n| *n > 0) {
      Some(n) => n,
      None => {
        let n = next;
        next = next.saturating_add(1);
        n
      }
    };
    let display_ref = format_display_ref(seq, &tx_type, &reference);
    conn.execute(
      r#"UPDATE "Transaction" SET displaySeq = ?1, displayRef = ?2 WHERE id = ?3"#,
      params![seq, display_ref, id],
    )?;
  }
  Ok(())
}

/// Next unused display number without allocating. Safe to show on a new form.
pub fn peek_display_seq(conn: &Connection) -> Result<i64, AppError> {
  let table_next: i64 = match conn.query_row(
    r#"SELECT "next" FROM "TransactionDisplaySequence" WHERE id = 1"#,
    [],
    |row| row.get(0),
  ) {
    Ok(n) => n,
    Err(_) => {
      sync_sequence_next(conn)?;
      conn.query_row(
        r#"SELECT "next" FROM "TransactionDisplaySequence" WHERE id = 1"#,
        [],
        |row| row.get(0),
      )?
    }
  };
  let max_used = max_display_seq(conn)?;
  Ok(table_next.max(max_used.saturating_add(1)).max(1))
}

/// Allocate the next unused display number. Caller must already be inside
/// BEGIN IMMEDIATE (or hold the app DB mutex) so two posts cannot share a number.
pub fn allocate_display_seq(conn: &Connection) -> Result<i64, AppError> {
  let n = peek_display_seq(conn)?;
  conn.execute(
    r#"UPDATE "TransactionDisplaySequence" SET "next" = ?1 WHERE id = 1"#,
    [n + 1],
  )?;
  Ok(n)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn prefixes_follow_existing_types() {
    assert_eq!(display_prefix("DEPOSIT", "DEP-1786940162756"), "DEP");
    assert_eq!(display_prefix("WITHDRAWAL", "WD-1"), "WD");
    assert_eq!(display_prefix("TRANSFER", "CASH-XFER-1"), "TR");
    assert_eq!(display_prefix("EXCHANGE", "FX-1"), "EX");
    assert_eq!(display_prefix("HAWALA", "HW-20260817-1"), "HW");
    assert_eq!(display_prefix("ADJUSTMENT", "OB-1786777971017-abc"), "OB");
    assert_eq!(display_prefix("ADJUSTMENT", "CASH-IN-1786780369858"), "CIN");
    assert_eq!(display_prefix("ADJUSTMENT", "CASH-OUT-1"), "COUT");
    assert_eq!(display_prefix("EXPENSE", "EXP-cat-1"), "EXP");
    assert_eq!(display_prefix("EXPENSE", "SAL-Ali-1"), "SAL");
    assert_eq!(display_prefix("ADJUSTMENT", "CAP-INVEST-1"), "CAP");
  }

  #[test]
  fn format_pads_until_10000() {
    assert_eq!(format_display_ref(1, "DEPOSIT", "DEP-x"), "DEP-0001");
    assert_eq!(format_display_ref(2, "WITHDRAWAL", "WD-x"), "WD-0002");
    assert_eq!(format_display_ref(9999, "EXCHANGE", "FX-x"), "EX-9999");
    assert_eq!(format_display_ref(10000, "HAWALA", "HW-x"), "HW-10000");
    assert_eq!(format_display_ref(933423, "DEPOSIT", "DEP-x"), "DEP-933423");
  }

  #[test]
  fn allocate_never_reuses_inside_one_db() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          type TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    ensure_display_seq_schema(&conn).unwrap();
    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let a = allocate_display_seq(&conn).unwrap();
    let b = allocate_display_seq(&conn).unwrap();
    conn.execute_batch("COMMIT;").unwrap();
    assert_eq!(a, 1);
    assert_eq!(b, 2);
  }

  #[test]
  fn peek_matches_allocate_without_consuming() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          type TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    ensure_display_seq_schema(&conn).unwrap();
    assert_eq!(peek_display_seq(&conn).unwrap(), 1);
    assert_eq!(peek_display_seq(&conn).unwrap(), 1);
    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    assert_eq!(allocate_display_seq(&conn).unwrap(), 1);
    conn.execute_batch("COMMIT;").unwrap();
    assert_eq!(peek_display_seq(&conn).unwrap(), 2);
  }

  #[test]
  fn backfill_is_chronological_and_unique() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          type TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
        INSERT INTO "Transaction" (id, reference, type, createdAt) VALUES
          ('b', 'WD-2', 'WITHDRAWAL', '2026-08-17 10:00:00'),
          ('a', 'DEP-1', 'DEPOSIT', '2026-08-17 09:00:00'),
          ('c', 'FX-3', 'EXCHANGE', '2026-08-17 11:00:00');
        "#,
      )
      .unwrap();
    ensure_display_seq_schema(&conn).unwrap();
    let mut stmt = conn
      .prepare(r#"SELECT id, displaySeq, displayRef FROM "Transaction" ORDER BY displaySeq"#)
      .unwrap();
    let rows: Vec<(String, i64, String)> = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
      .unwrap()
      .map(|r| r.unwrap())
      .collect();
    assert_eq!(
      rows,
      vec![
        ("a".into(), 1, "DEP-0001".into()),
        ("b".into(), 2, "WD-0002".into()),
        ("c".into(), 3, "EX-0003".into()),
      ]
    );
    let next: i64 = conn
      .query_row(
        r#"SELECT next FROM TransactionDisplaySequence WHERE id=1"#,
        [],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(next, 4);
  }

  #[test]
  fn deleted_numbers_are_never_reused() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          type TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    ensure_display_seq_schema(&conn).unwrap();
    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let a = allocate_display_seq(&conn).unwrap();
    conn
      .execute(
        r#"INSERT INTO "Transaction" (id, reference, type, displaySeq, displayRef)
           VALUES ('old', 'DEP-x', 'DEPOSIT', ?1, 'DEP-0001')"#,
        [a],
      )
      .unwrap();
    let b = allocate_display_seq(&conn).unwrap();
    conn.execute_batch("COMMIT;").unwrap();
    assert_eq!(a, 1);
    assert_eq!(b, 2);
  }

  #[test]
  fn chrono_order_follows_display_seq_not_type_or_value_date() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          valueDate TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          displaySeq INTEGER,
          deletedAt TEXT
        );
        INSERT INTO "Transaction" (id, type, valueDate, createdAt, displaySeq) VALUES
          ('wd1', 'WITHDRAWAL', '2026-09-08', '2026-09-08 09:00:00', 1),
          ('dp1', 'DEPOSIT',    '2026-09-08', '2026-09-08 09:00:00', 2),
          ('hw1', 'HAWALA',     '2026-09-08', '2026-09-08 09:00:00', 3),
          ('ex1', 'EXPENSE',    '2026-09-08', '2026-09-08 09:00:00', 4),
          ('fx1', 'EXCHANGE',   '2026-09-08', '2026-09-08 09:00:00', 5),
          ('dp2', 'DEPOSIT',    '2026-09-08', '2026-09-08 09:00:00', 6),
          ('wd2', 'WITHDRAWAL', '2026-09-08', '2026-09-08 09:00:00', 7);
        "#,
      )
      .unwrap();

    let sql = format!(
      r#"SELECT id FROM "Transaction" t WHERE deletedAt IS NULL ORDER BY {TX_CHRONO_ASC}"#
    );
    let ids: Vec<String> = conn
      .prepare(&sql)
      .unwrap()
      .query_map([], |row| row.get(0))
      .unwrap()
      .map(|r| r.unwrap())
      .collect();
    assert_eq!(ids, vec!["wd1", "dp1", "hw1", "ex1", "fx1", "dp2", "wd2"]);

    let filtered_sql = format!(
      r#"SELECT id FROM "Transaction" t
         WHERE deletedAt IS NULL AND type = 'DEPOSIT'
         ORDER BY {TX_CHRONO_ASC}"#
    );
    let deposits: Vec<String> = conn
      .prepare(&filtered_sql)
      .unwrap()
      .query_map([], |row| row.get(0))
      .unwrap()
      .map(|r| r.unwrap())
      .collect();
    assert_eq!(deposits, vec!["dp1", "dp2"]);
  }
}
