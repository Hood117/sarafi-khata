//! Unified account numbers: Main Vault = #1, customers = #2, #3, …
//! Auto-allocated, never edited, never reused (ADR-045).

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::ledger::main_vault::{ensure_main_vault, MAIN_VAULT_WALLET_NAME};
use crate::util::now_sqlite;

pub const MAIN_VAULT_ACCOUNT_NUMBER: i64 = 1;

fn parse_digit_code(code: &str) -> Option<i64> {
  let t = code.trim();
  if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit()) {
    return None;
  }
  t.parse::<i64>().ok().filter(|&n| n > 0)
}

fn max_existing_account_number(conn: &Connection) -> Result<i64, AppError> {
  let mut max = MAIN_VAULT_ACCOUNT_NUMBER;
  let mut stmt = conn
    .prepare("SELECT code FROM Customer WHERE code IS NOT NULL")
    .map_err(|e| AppError::Db(format!("scan customer account numbers: {e}")))?;
  for row in stmt.query_map([], |row| row.get::<_, String>(0))? {
    if let Some(n) = parse_digit_code(&row?) {
      max = max.max(n);
    }
  }
  let mut stmt = conn
    .prepare(
      "SELECT code FROM Wallet
       WHERE code IS NOT NULL AND deletedAt IS NULL
         AND type IN ('VAULT','TILL','CUSTOMER')",
    )
    .map_err(|e| AppError::Db(format!("scan wallet account numbers: {e}")))?;
  for row in stmt.query_map([], |row| row.get::<_, String>(0))? {
    if let Some(n) = parse_digit_code(&row?) {
      max = max.max(n);
    }
  }
  Ok(max)
}

/// Ensure sequence table + Main Vault #1. Safe to call on every open.
pub fn ensure_account_number_schema(conn: &Connection) -> Result<(), AppError> {
  conn
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS AccountNumberSequence (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next INTEGER NOT NULL
      );
      "#,
    )
    .map_err(|e| AppError::Db(format!("AccountNumberSequence: {e}")))?;

  // Never-reuse: global unique on Customer.code (incl. archived).
  let _ = conn.execute_batch(
    r#"
    DROP INDEX IF EXISTS Customer_code_active_key;
    CREATE UNIQUE INDEX IF NOT EXISTS Customer_code_key
      ON Customer(code) WHERE code IS NOT NULL;
    "#,
  );

  let has_row: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM AccountNumberSequence WHERE id = 1)",
    [],
    |row| row.get(0),
  )?;
  if !has_row {
    let next = max_existing_account_number(conn)?.saturating_add(1).max(MAIN_VAULT_ACCOUNT_NUMBER + 1);
    conn.execute(
      "INSERT INTO AccountNumberSequence (id, next) VALUES (1, ?1)",
      [next],
    )?;
  } else {
    // Keep sequence at least past any existing numbers (e.g. after restore / partial wipe).
    let current: i64 = conn.query_row(
      "SELECT next FROM AccountNumberSequence WHERE id = 1",
      [],
      |row| row.get(0),
    )?;
    let min_next = max_existing_account_number(conn)?.saturating_add(1).max(MAIN_VAULT_ACCOUNT_NUMBER + 1);
    if current < min_next {
      conn.execute(
        "UPDATE AccountNumberSequence SET next = ?1 WHERE id = 1",
        [min_next],
      )?;
    }
  }

  ensure_main_vault_account_number(conn)?;
  Ok(())
}

/// Main Vault always holds account number 1. Not user-editable.
pub fn ensure_main_vault_account_number(conn: &Connection) -> Result<String, AppError> {
  let id = ensure_main_vault(conn)?;
  let now = now_sqlite();
  let code: Option<String> = conn
    .query_row(
      "SELECT code FROM Wallet WHERE id = ?1 LIMIT 1",
      [&id],
      |row| row.get(0),
    )
    .optional()?
    .flatten();
  let needs = match code.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    Some("1") => false,
    _ => true,
  };
  if needs {
    conn.execute(
      "UPDATE Wallet SET code = '1', updatedAt = ?2 WHERE id = ?1",
      params![id, now],
    )?;
  }
  Ok(id)
}

/// Allocate the next unused account number (starts at 2 after Main Vault #1).
pub fn allocate_next_account_number(conn: &Connection) -> Result<String, AppError> {
  ensure_account_number_schema(conn)?;
  let next: i64 = conn.query_row(
    "SELECT next FROM AccountNumberSequence WHERE id = 1",
    [],
    |row| row.get(0),
  )?;
  let n = next.max(MAIN_VAULT_ACCOUNT_NUMBER + 1);
  conn.execute(
    "UPDATE AccountNumberSequence SET next = ?1 WHERE id = 1",
    [n + 1],
  )?;
  Ok(n.to_string())
}

/// Reset allocator after a clean business-data wipe (next customer = #2).
#[allow(dead_code)]
pub fn reset_account_number_sequence_after_wipe(conn: &Connection) -> Result<(), AppError> {
  ensure_account_number_schema(conn)?;
  ensure_main_vault_account_number(conn)?;
  conn.execute(
    "UPDATE AccountNumberSequence SET next = ?1 WHERE id = 1",
    [MAIN_VAULT_ACCOUNT_NUMBER + 1],
  )?;
  Ok(())
}

/// Display label for a wallet's account number (customer code preferred).
#[allow(dead_code)]
pub fn resolve_wallet_account_code(
  conn: &Connection,
  wallet_id: &str,
) -> Result<(String, String), AppError> {
  conn
    .query_row(
      r#"SELECT COALESCE(cust.code, ''), COALESCE(cust.fullName, ''),
                COALESCE(w.code, ''), w.name, w.type
         FROM Wallet w
         LEFT JOIN Customer cust ON cust.id = w.customerId
         WHERE w.id = ?1 LIMIT 1"#,
      [wallet_id],
      |row| {
        let cust_code: String = row.get(0)?;
        let cust_name: String = row.get(1)?;
        let wallet_code: String = row.get(2)?;
        let wallet_name: String = row.get(3)?;
        let wallet_type: String = row.get(4)?;
        let code = if !cust_code.trim().is_empty() {
          cust_code.trim().to_string()
        } else if !wallet_code.trim().is_empty() {
          wallet_code.trim().to_string()
        } else {
          String::new()
        };
        let name = if !cust_name.trim().is_empty() {
          cust_name
        } else {
          wallet_name
        };
        // Main Vault fallback name
        let name = if name.trim().is_empty() && wallet_type.eq_ignore_ascii_case("VAULT") {
          MAIN_VAULT_WALLET_NAME.to_string()
        } else {
          name
        };
        Ok((code, name))
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet not found.".into()),
      other => other.into(),
    })
}
