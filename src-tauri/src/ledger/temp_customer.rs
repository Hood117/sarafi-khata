//! Temporary customer auto-archive when wallet balances settle to zero.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::util::now_sqlite;

const EPS: f64 = 1e-9;

fn normalize_customer_type(raw: &str) -> String {
  let t = raw.trim().to_ascii_uppercase();
  if t == "TEMPORARY" || t == "TEMP" {
    "TEMPORARY".into()
  } else {
    "PERMANENT".into()
  }
}

/// Parse create/update input into PERMANENT | TEMPORARY.
pub fn parse_customer_type(raw: Option<&str>) -> String {
  match raw {
    Some(s) => normalize_customer_type(s),
    None => "PERMANENT".into(),
  }
}

fn customer_has_open_balance(conn: &Connection, customer_id: &str) -> Result<bool, AppError> {
  let open: i64 = conn.query_row(
    r#"SELECT EXISTS(
         SELECT 1
         FROM Wallet w
         INNER JOIN WalletCurrencyBalance b ON b.walletId = w.id
         WHERE w.customerId = ?1
           AND w.type = 'CUSTOMER'
           AND w.deletedAt IS NULL
           AND ABS(COALESCE(b.balance, 0)) > ?2
       )"#,
    params![customer_id, EPS],
    |row| row.get(0),
  )?;
  Ok(open != 0)
}

/// Soft-archive a TEMPORARY customer when every currency balance is ~0.
/// No-op for permanent customers, already-archived rows, or open balances.
pub fn maybe_auto_archive_temporary_customer(
  conn: &Connection,
  customer_id: &str,
) -> Result<(), AppError> {
  let id = customer_id.trim();
  if id.is_empty() {
    return Ok(());
  }

  let row: Option<(String, Option<String>)> = conn
    .query_row(
      r#"SELECT IFNULL(customerType, 'PERMANENT'), deletedAt
         FROM Customer WHERE id = ?1 LIMIT 1"#,
      [id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;

  let Some((ctype, deleted_at)) = row else {
    return Ok(());
  };
  if deleted_at.is_some() {
    return Ok(());
  }
  if normalize_customer_type(&ctype) != "TEMPORARY" {
    return Ok(());
  }
  if customer_has_open_balance(conn, id)? {
    return Ok(());
  }

  let now = now_sqlite();
  conn.execute(
    r#"UPDATE Customer
       SET deletedAt = ?1, isActive = 0, updatedAt = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;
  Ok(())
}

/// Resolve customer ids for CUSTOMER wallets and auto-archive temporary ones with zero balance.
pub fn maybe_auto_archive_temporary_customers_for_wallets(
  conn: &Connection,
  wallet_ids: &[String],
) -> Result<(), AppError> {
  if wallet_ids.is_empty() {
    return Ok(());
  }
  let mut customer_ids: Vec<String> = Vec::new();
  for wid in wallet_ids {
    let cid: Option<String> = conn
      .query_row(
        r#"SELECT customerId FROM Wallet
           WHERE id = ?1 AND type = 'CUSTOMER' AND customerId IS NOT NULL
           LIMIT 1"#,
        [wid],
        |row| row.get(0),
      )
      .optional()?;
    if let Some(cid) = cid {
      if !customer_ids.iter().any(|x| x == &cid) {
        customer_ids.push(cid);
      }
    }
  }
  for cid in customer_ids {
    maybe_auto_archive_temporary_customer(conn, &cid)?;
  }
  Ok(())
}

/// Collect customer ids touched by a transaction's ledger lines, then auto-archive if needed.
pub fn maybe_auto_archive_temporary_customers_for_transaction(
  conn: &Connection,
  transaction_id: &str,
) -> Result<(), AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT DISTINCT w.customerId
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       WHERE le.transactionId = ?1
         AND w.type = 'CUSTOMER'
         AND w.customerId IS NOT NULL"#,
  )?;
  let ids = stmt
    .query_map([transaction_id], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  for cid in ids {
    maybe_auto_archive_temporary_customer(conn, &cid)?;
  }
  Ok(())
}

/// Re-activate a soft-archived TEMPORARY customer when correcting a prior movement.
fn maybe_auto_restore_temporary_customer_for_edit(
  conn: &Connection,
  customer_id: &str,
) -> Result<(), AppError> {
  let id = customer_id.trim();
  if id.is_empty() {
    return Ok(());
  }

  let row: Option<(String, Option<String>, Option<String>, i64)> = conn
    .query_row(
      r#"SELECT IFNULL(customerType, 'PERMANENT'), deletedAt, purgedAt, isActive
         FROM Customer WHERE id = ?1 LIMIT 1"#,
      [id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?;

  let Some((ctype, deleted_at, purged_at, active)) = row else {
    return Ok(());
  };
  if normalize_customer_type(&ctype) != "TEMPORARY" {
    return Ok(());
  }
  // Past 30-day archive retention — leave purged; history stays in Daybook.
  if purged_at.is_some() {
    return Ok(());
  }
  if deleted_at.is_none() && active != 0 {
    return Ok(());
  }

  let now = now_sqlite();
  conn.execute(
    r#"UPDATE Customer
       SET deletedAt = NULL, purgedAt = NULL, isActive = 1, updatedAt = ?1
       WHERE id = ?2 AND purgedAt IS NULL"#,
    params![now, id],
  )?;
  Ok(())
}

/// When editing a movement (replace), re-activate archived TEMPORARY customers involved.
pub fn restore_temporary_customers_for_movement_edit(
  conn: &Connection,
  replace_transaction_id: Option<&str>,
  explicit_customer_ids: &[&str],
) -> Result<(), AppError> {
  let Some(tx_id) = replace_transaction_id
    .map(str::trim)
    .filter(|s| !s.is_empty())
  else {
    return Ok(());
  };

  let mut customer_ids: Vec<String> = explicit_customer_ids
    .iter()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .collect();

  if let Ok(Some(cid)) = conn
    .query_row(
      r#"SELECT customerId FROM "Transaction"
         WHERE id = ?1 AND customerId IS NOT NULL LIMIT 1"#,
      [tx_id],
      |row| row.get::<_, String>(0),
    )
    .optional()
  {
    if !customer_ids.iter().any(|x| x == &cid) {
      customer_ids.push(cid);
    }
  }

  let mut stmt = conn.prepare(
    r#"SELECT DISTINCT w.customerId
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       WHERE le.transactionId = ?1
         AND w.type = 'CUSTOMER'
         AND w.customerId IS NOT NULL"#,
  )?;
  let ledger_ids = stmt
    .query_map([tx_id], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  for cid in ledger_ids {
    if !customer_ids.iter().any(|x| x == &cid) {
      customer_ids.push(cid);
    }
  }

  for cid in customer_ids {
    maybe_auto_restore_temporary_customer_for_edit(conn, &cid)?;
  }
  Ok(())
}
