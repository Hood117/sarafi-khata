//! Settings → Database → Reset Business Data.
//! Wipes business/test rows in the live SQLite file. Does not delete license.json,
//! the install, or the schema. WAL is checkpointed; pending-restore files are cleared.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::backup::{clear_stale_restore_sidecars, create_backup};
use crate::commands::authorize::{require_user_admin, system_admin_username};
use crate::error::AppError;
use crate::migrate;
use crate::state::AppState;

use rusqlite::Connection;

const CONFIRMATION_WORD: &str = "RESET";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetBusinessDataInput {
  pub confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetBusinessDataResult {
  pub backup_stamp: Option<String>,
  pub message: String,
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, AppError> {
  let n: i64 = conn.query_row(
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
    [name],
    |row| row.get(0),
  )?;
  Ok(n > 0)
}

fn list_user_tables(conn: &Connection) -> Result<Vec<String>, AppError> {
  let mut stmt = conn
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .map_err(|e| AppError::Db(format!("list tables: {e}")))?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|e| AppError::Db(format!("list tables map: {e}")))?;
  let mut names = Vec::new();
  for row in rows {
    names.push(row.map_err(|e| AppError::Db(format!("list tables row: {e}")))?);
  }
  Ok(names)
}

/// Tables whose rows are configuration / identity — never emptied wholesale.
const KEEP_TABLES: &[&str] = &[
  "saraf_migrations",
  "_prisma_migrations",
  "Currency",
  "CurrencyDenomination",
  "SystemSetting",
  "User",
  "Wallet",
  "AccountNumberSequence",
  "TransactionDisplaySequence",
];

fn quote_ident(name: &str) -> Result<String, AppError> {
  if name.is_empty() || name.contains('"') || name.contains('\0') {
    return Err(AppError::Db(format!("refusing to wipe table {name:?}")));
  }
  Ok(format!("\"{name}\""))
}

fn delete_if_exists(conn: &Connection, sql: &str, table: &str) -> Result<u64, AppError> {
  if !table_exists(conn, table)? {
    return Ok(0);
  }
  let n = conn
    .execute(sql, [])
    .map_err(|e| AppError::Db(format!("{sql}: {e}")))?;
  Ok(n as u64)
}

/// Business-data wipe on an open connection. Schema, currencies, system wallets,
/// SystemSetting, and the built-in admin user are kept.
pub fn wipe_business_data(conn: &Connection) -> Result<(), AppError> {
  conn
    .execute_batch("PRAGMA foreign_keys = OFF;")
    .map_err(|e| AppError::Db(format!("fk off: {e}")))?;

  let statements: &[(&str, &str)] = &[
    ("LedgerEntry", "DELETE FROM LedgerEntry"),
    ("Transaction", r#"DELETE FROM "Transaction""#),
    ("ExchangeDeal", "DELETE FROM ExchangeDeal"),
    ("ExchangeRate", "DELETE FROM ExchangeRate"),
    ("OwnerCapitalEvent", "DELETE FROM OwnerCapitalEvent"),
    ("BusinessDayCashCount", "DELETE FROM BusinessDayCashCount"),
    ("BusinessDay", "DELETE FROM BusinessDay"),
    ("VaultReconciliationLine", "DELETE FROM VaultReconciliationLine"),
    ("VaultReconciliation", "DELETE FROM VaultReconciliation"),
    ("MarketRateCache", "DELETE FROM MarketRateCache"),
    (
      "PartnerCommissionSettlement",
      "DELETE FROM PartnerCommissionSettlement",
    ),
    ("HawalaAttachment", "DELETE FROM HawalaAttachment"),
    ("HawalaEvent", "DELETE FROM HawalaEvent"),
    ("HawalaTransfer", "DELETE FROM HawalaTransfer"),
    ("PartnerSarafi", "DELETE FROM PartnerSarafi"),
    ("TradingTrade", "DELETE FROM TradingTrade"),
    ("TradingInventory", "DELETE FROM TradingInventory"),
    ("TradingMarketRate", "DELETE FROM TradingMarketRate"),
    ("EmployeeSalaryPayment", "DELETE FROM EmployeeSalaryPayment"),
    ("Employee", "DELETE FROM Employee"),
    ("WalletCurrencyBalance", "DELETE FROM WalletCurrencyBalance"),
    (
      "Wallet",
      "DELETE FROM Wallet WHERE type = 'CUSTOMER' OR customerId IS NOT NULL",
    ),
    ("Wallet", "DELETE FROM Wallet WHERE type = 'PARTNER'"),
    (
      "Wallet",
      "DELETE FROM Wallet WHERE type IN ('VAULT','TILL') AND name NOT IN ('Main Vault', 'Cash Till')",
    ),
    ("Wallet", "DELETE FROM Wallet WHERE type = 'BANK'"),
    ("Customer", "DELETE FROM Customer"),
    ("Session", "DELETE FROM Session"),
    ("AuditLog", "DELETE FROM AuditLog"),
  ];

  conn
    .execute_batch("BEGIN IMMEDIATE;")
    .map_err(|e| AppError::Db(format!("begin reset: {e}")))?;

  let result = (|| -> Result<(), AppError> {
    for (table, sql) in statements {
      delete_if_exists(conn, sql, table)?;
    }
    if table_exists(conn, "User")? {
      conn
        .execute(
          r#"DELETE FROM "User"
             WHERE lower(username) != lower(?1)
               AND lower(username) != lower(?2)"#,
          rusqlite::params![system_admin_username(), "admin"],
        )
        .map_err(|e| AppError::Db(format!("delete non-admin users: {e}")))?;
    }
    if table_exists(conn, "AccountNumberSequence")? {
      conn
        .execute(
          r#"INSERT INTO AccountNumberSequence (id, next) VALUES (1, 2)
             ON CONFLICT(id) DO UPDATE SET next = 2"#,
          [],
        )
        .map_err(|e| AppError::Db(format!("reset account sequence: {e}")))?;
    }
    if table_exists(conn, "Wallet")? {
      conn
        .execute(
          r#"UPDATE Wallet SET code = '1'
             WHERE name = 'Main Vault' AND type = 'VAULT' AND deletedAt IS NULL"#,
          [],
        )
        .map_err(|e| AppError::Db(format!("reset main vault code: {e}")))?;
    }
    if table_exists(conn, "TransactionDisplaySequence")? {
      conn
        .execute(
          r#"INSERT INTO TransactionDisplaySequence (id, next) VALUES (1, 1)
             ON CONFLICT(id) DO UPDATE SET next = 1"#,
          [],
        )
        .map_err(|e| AppError::Db(format!("reset display sequence: {e}")))?;
    }
    if table_exists(conn, "sqlite_sequence")? {
      let _ = conn.execute("DELETE FROM sqlite_sequence", []);
    }
    for name in list_user_tables(conn)? {
      if KEEP_TABLES.iter().any(|keep| keep.eq_ignore_ascii_case(&name)) {
        continue;
      }
      let ident = quote_ident(&name)?;
      let sql = format!("DELETE FROM {ident}");
      conn
        .execute(&sql, [])
        .map_err(|e| AppError::Db(format!("{sql}: {e}")))?;
    }
    Ok(())
  })();

  match result {
    Ok(()) => {
      conn
        .execute_batch("COMMIT;")
        .map_err(|e| AppError::Db(format!("commit reset: {e}")))?;
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
      return Err(e);
    }
  }

  conn
    .execute_batch("PRAGMA foreign_keys = ON;")
    .map_err(|e| AppError::Db(format!("fk on: {e}")))?;
  Ok(())
}

fn migration_dir_candidates(app: &AppHandle) -> Vec<std::path::PathBuf> {
  let mut dirs = Vec::new();
  if let Ok(resource_dir) = app.path().resource_dir() {
    dirs.push(resource_dir.join("migrations"));
    dirs.push(resource_dir.join("resources").join("migrations"));
  }
  if let Ok(cwd) = std::env::current_dir() {
    dirs.push(cwd.join("src-tauri").join("migrations"));
    dirs.push(cwd.join("migrations"));
  }
  dirs
}

/// Admin-only reset of business data. Creates a pre-reset backup, flushes WAL,
/// wipes business rows, re-runs schema compat / default admin seed.
#[tauri::command]
pub fn reset_business_data(
  app: AppHandle,
  state: State<'_, AppState>,
  input: ResetBusinessDataInput,
) -> Result<ResetBusinessDataResult, AppError> {
  if input.confirmation.trim() != CONFIRMATION_WORD {
    return Err(AppError::Validation(
      "Type RESET exactly to confirm this action.".into(),
    ));
  }

  let backup_stamp = {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    let backup = create_backup(&conn, &state.db_path, "pre-reset")?;
    // Clear pending-restore files before wiping so a crash cannot resurrect old data.
    clear_stale_restore_sidecars(&state.db_path)?;
    wipe_business_data(&conn)?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    Some(backup.stamp)
  };

  {
    let conn = state.db.lock();
    if let Ok(migrations) = migrate::migrations_dir(&migration_dir_candidates(&app)) {
      migrate::apply_pending_migrations(&conn, &migrations)?;
    }
    migrate::ensure_schema_compat(&conn)?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
  }

  Ok(ResetBusinessDataResult {
    backup_stamp,
    message: "Business data has been reset. Sign in with the default administrator account."
      .into(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use rusqlite::Connection;

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullName TEXT,
          role TEXT,
          isActive INTEGER DEFAULT 1
        );
        CREATE TABLE Customer (id TEXT PRIMARY KEY, fullName TEXT, code TEXT);
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY, type TEXT, reference TEXT, deletedAt TEXT
        );
        CREATE TABLE LedgerEntry (
          id TEXT PRIMARY KEY, transactionId TEXT, amount TEXT
        );
        CREATE TABLE HawalaTransfer (id TEXT PRIMARY KEY, reference TEXT);
        CREATE TABLE ExchangeDeal (id TEXT PRIMARY KEY, transactionId TEXT);
        CREATE TABLE PartnerSarafi (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE Wallet (
          id TEXT PRIMARY KEY, type TEXT, name TEXT, customerId TEXT, code TEXT, deletedAt TEXT
        );
        CREATE TABLE Session (id TEXT PRIMARY KEY, userId TEXT);
        CREATE TABLE TransactionDisplaySequence (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          next INTEGER NOT NULL
        );
        CREATE TABLE AccountNumberSequence (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          next INTEGER NOT NULL
        );
        INSERT INTO "User" (id, username, fullName, role) VALUES
          ('u-admin', 'Saraf@@', 'System Administrator', 'ADMIN'),
          ('u-cashier', 'cashier1', 'Cashier', 'CASHIER');
        INSERT INTO Customer (id, fullName, code) VALUES ('c1', 'Test Customer', '2');
        INSERT INTO "Transaction" (id, type, reference) VALUES
          ('t-dep', 'DEPOSIT', 'DEP-1'),
          ('t-wd', 'WITHDRAWAL', 'WD-1'),
          ('t-hw', 'HAWALA', 'HW-1'),
          ('t-ex', 'EXPENSE', 'EXP-1'),
          ('t-fx', 'EXCHANGE', 'FX-1');
        INSERT INTO LedgerEntry (id, transactionId, amount) VALUES
          ('le1', 't-dep', '100'), ('le2', 't-wd', '50');
        INSERT INTO HawalaTransfer (id, reference) VALUES ('h1', 'HW-1');
        INSERT INTO ExchangeDeal (id, transactionId) VALUES ('d1', 't-fx');
        INSERT INTO PartnerSarafi (id, name) VALUES ('p1', 'Test Partner');
        INSERT INTO Wallet (id, type, name, customerId, code) VALUES
          ('w-mv', 'VAULT', 'Main Vault', NULL, '1'),
          ('w-sys', 'SYSTEM', 'Rent', NULL, NULL),
          ('w-cust', 'CUSTOMER', 'Test Customer AFN', 'c1', '2');
        INSERT INTO Session (id, userId) VALUES ('s1', 'u-admin');
        INSERT INTO TransactionDisplaySequence (id, next) VALUES (1, 26);
        INSERT INTO AccountNumberSequence (id, next) VALUES (1, 9);
        "#,
      )
      .unwrap();
    conn
  }

  fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |row| row.get(0)).unwrap()
  }

  #[test]
  fn wipe_removes_business_rows_keeps_admin_and_system_wallets() {
    let conn = setup();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM Customer"), 1);
    assert_eq!(count(&conn, r#"SELECT COUNT(*) FROM "Transaction""#), 5);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM HawalaTransfer"), 1);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM ExchangeDeal"), 1);

    wipe_business_data(&conn).unwrap();

    assert_eq!(count(&conn, "SELECT COUNT(*) FROM Customer"), 0);
    assert_eq!(count(&conn, r#"SELECT COUNT(*) FROM "Transaction""#), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM LedgerEntry"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM HawalaTransfer"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM ExchangeDeal"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM PartnerSarafi"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM Session"), 0);
    assert_eq!(
      count(&conn, r#"SELECT COUNT(*) FROM "User" WHERE username = 'cashier1'"#),
      0
    );
    assert_eq!(
      count(&conn, r#"SELECT COUNT(*) FROM "User" WHERE username = 'Saraf@@'"#),
      1
    );
    assert_eq!(
      count(
        &conn,
        "SELECT COUNT(*) FROM Wallet WHERE name = 'Main Vault' AND type = 'VAULT'"
      ),
      1
    );
    assert_eq!(
      count(&conn, "SELECT COUNT(*) FROM Wallet WHERE type = 'SYSTEM'"),
      1
    );
    assert_eq!(
      count(&conn, "SELECT COUNT(*) FROM Wallet WHERE type = 'CUSTOMER'"),
      0
    );
    let next: i64 = conn
      .query_row(
        "SELECT next FROM AccountNumberSequence WHERE id = 1",
        [],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(next, 2);
    let display_next: i64 = conn
      .query_row(
        "SELECT next FROM TransactionDisplaySequence WHERE id = 1",
        [],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(display_next, 1);
  }

  #[test]
  fn wipe_skips_missing_tables() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(r#"CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT NOT NULL);"#)
      .unwrap();
    wipe_business_data(&conn).unwrap();
  }

  #[test]
  fn wipe_on_wal_file_keeps_license_and_allows_reopen() {
    use crate::backup::clear_stale_restore_sidecars;
    use crate::db::open_database;
    use std::fs;

    let dir = std::env::temp_dir().join(format!(
      "saraf-reset-wal-{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    let db_path = dir.join("saraf.db");
    let license_path = dir.join("license.json");
    fs::write(&license_path, br#"{"activated":true,"machineId":"test"}"#).unwrap();
    fs::write(dir.join("saraf.restore-session.json"), b"{}").unwrap();

    let conn = open_database(&db_path).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY, username TEXT NOT NULL, fullName TEXT, role TEXT
        );
        CREATE TABLE Customer (id TEXT PRIMARY KEY, fullName TEXT);
        CREATE TABLE "Transaction" (id TEXT PRIMARY KEY, type TEXT, reference TEXT);
        CREATE TABLE LedgerEntry (id TEXT PRIMARY KEY, transactionId TEXT, amount TEXT);
        CREATE TABLE HawalaTransfer (id TEXT PRIMARY KEY, reference TEXT);
        CREATE TABLE ExchangeDeal (id TEXT PRIMARY KEY, transactionId TEXT);
        CREATE TABLE PartnerSarafi (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE Wallet (
          id TEXT PRIMARY KEY, type TEXT, name TEXT, customerId TEXT, code TEXT, deletedAt TEXT
        );
        INSERT INTO "User" (id, username, fullName, role) VALUES
          ('u-admin', 'Saraf@@', 'System Administrator', 'ADMIN');
        INSERT INTO Customer (id, fullName) VALUES ('c1', 'Test Customer');
        INSERT INTO "Transaction" (id, type, reference) VALUES
          ('t-dep', 'DEPOSIT', 'DEP-1'),
          ('t-wd', 'WITHDRAWAL', 'WD-1'),
          ('t-hw', 'HAWALA', 'HW-1'),
          ('t-ex', 'EXPENSE', 'EXP-1'),
          ('t-fx', 'EXCHANGE', 'FX-1');
        INSERT INTO LedgerEntry (id, transactionId, amount) VALUES ('le1', 't-dep', '100');
        INSERT INTO HawalaTransfer (id, reference) VALUES ('h1', 'HW-1');
        INSERT INTO ExchangeDeal (id, transactionId) VALUES ('d1', 't-fx');
        INSERT INTO PartnerSarafi (id, name) VALUES ('p1', 'Partner Kata');
        INSERT INTO Wallet (id, type, name, customerId, code) VALUES
          ('w-mv', 'VAULT', 'Main Vault', NULL, '1'),
          ('w-cust', 'CUSTOMER', 'Test Customer AFN', 'c1', '2');
        "#,
      )
      .unwrap();
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
    wipe_business_data(&conn).unwrap();
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    drop(conn);

    clear_stale_restore_sidecars(&db_path).unwrap();
    assert!(license_path.is_file());
    assert!(!dir.join("saraf.restore-session.json").is_file());

    let conn = open_database(&db_path).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM Customer"), 0);
    assert_eq!(count(&conn, r#"SELECT COUNT(*) FROM "Transaction""#), 0);
    assert_eq!(
      count(&conn, r#"SELECT COUNT(*) FROM "User" WHERE username = 'Saraf@@'"#),
      1
    );
    conn
      .execute(
        "INSERT INTO Customer (id, fullName) VALUES ('c-after', 'After Reset')",
        [],
      )
      .unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM Customer"), 1);
    drop(conn);
    let _ = fs::remove_dir_all(&dir);
  }
}
