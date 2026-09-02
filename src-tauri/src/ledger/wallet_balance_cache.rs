//! Cached per-wallet×currency balances — avoids full LedgerEntry SUM on every screen open.
//!
//! Updated on every successful post / soft-delete; rebuilt once at migrate if empty/stale.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::util::now_sqlite;

const META_KEY: &str = "wallet_currency_balance_cache_v1";

pub fn ensure_wallet_balance_cache(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "LedgerEntry")? {
    return Ok(());
  }

  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS WalletCurrencyBalance (
      walletId TEXT NOT NULL,
      currencyId TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      lastValueDate TEXT,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (walletId, currencyId)
    );
    CREATE INDEX IF NOT EXISTS WalletCurrencyBalance_currencyId_idx
      ON WalletCurrencyBalance(currencyId);
    CREATE INDEX IF NOT EXISTS WalletCurrencyBalance_balance_idx
      ON WalletCurrencyBalance(balance);
    "#,
  )
  .map_err(|e| AppError::Db(format!("WalletCurrencyBalance schema: {e}")))?;

  ensure_meta_table(conn)?;

  let stamped: bool = conn
    .query_row(
      "SELECT EXISTS(SELECT 1 FROM AppMeta WHERE key = ?1)",
      [META_KEY],
      |row| row.get(0),
    )
    .unwrap_or(false);

  let cache_rows: i64 = conn
    .query_row("SELECT COUNT(*) FROM WalletCurrencyBalance", [], |row| row.get(0))
    .unwrap_or(0);
  let ledger_rows: i64 = conn
    .query_row("SELECT COUNT(*) FROM LedgerEntry", [], |row| row.get(0))
    .unwrap_or(0);

  // Rebuild when never stamped, or cache empty while ledger has data.
  if !stamped || (cache_rows == 0 && ledger_rows > 0) {
    rebuild_wallet_balance_cache(conn)?;
    let now = now_sqlite();
    conn.execute(
      "INSERT INTO AppMeta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![META_KEY, now],
    )
    .map_err(|e| AppError::Db(format!("stamp wallet balance cache: {e}")))?;
    log::info!("WalletCurrencyBalance cache rebuilt ({ledger_rows} ledger rows)");
  }

  Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
    [name],
    |row| row.get(0),
  )?;
  Ok(exists)
}

fn ensure_meta_table(conn: &Connection) -> Result<(), AppError> {
  conn
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS AppMeta (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
      );
      "#,
    )
    .map_err(|e| AppError::Db(format!("AppMeta schema: {e}")))?;
  Ok(())
}

pub fn rebuild_wallet_balance_cache(conn: &Connection) -> Result<(), AppError> {
  conn.execute("DELETE FROM WalletCurrencyBalance", [])?;
  conn.execute(
    r#"INSERT INTO WalletCurrencyBalance (walletId, currencyId, balance, lastValueDate, updatedAt)
       SELECT le.walletId, le.currencyId,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0),
              MAX(t.valueDate),
              datetime('now')
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       GROUP BY le.walletId, le.currencyId
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-12"#,
    [],
  )?;
  Ok(())
}

/// Apply one ledger line to the cache (DEBIT +, CREDIT −).
pub fn apply_balance_delta(
  conn: &Connection,
  wallet_id: &str,
  currency_id: &str,
  direction: &str,
  amount_major: f64,
  value_date: &str,
) -> Result<(), AppError> {
  let signed = if direction.eq_ignore_ascii_case("DEBIT") {
    amount_major
  } else {
    -amount_major
  };
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO WalletCurrencyBalance (walletId, currencyId, balance, lastValueDate, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(walletId, currencyId) DO UPDATE SET
         balance = WalletCurrencyBalance.balance + excluded.balance,
         lastValueDate = CASE
           WHEN excluded.lastValueDate IS NOT NULL
             AND (WalletCurrencyBalance.lastValueDate IS NULL
                  OR excluded.lastValueDate > WalletCurrencyBalance.lastValueDate)
           THEN excluded.lastValueDate
           ELSE WalletCurrencyBalance.lastValueDate
         END,
         updatedAt = excluded.updatedAt"#,
    params![wallet_id, currency_id, signed, value_date, now],
  )?;
  Ok(())
}

/// Reverse all ledger lines of a still-visible transaction (call before soft-delete).
pub fn reverse_transaction_balances(conn: &Connection, transaction_id: &str) -> Result<(), AppError> {
  if !table_exists(conn, "WalletCurrencyBalance")? {
    return Ok(());
  }
  let value_date: String = conn
    .query_row(
      r#"SELECT valueDate FROM "Transaction" WHERE id = ?1"#,
      [transaction_id],
      |row| row.get(0),
    )
    .optional()?
    .unwrap_or_default();

  let mut stmt = conn.prepare(
    r#"SELECT walletId, currencyId, direction, CAST(amount AS REAL)
       FROM LedgerEntry WHERE transactionId = ?1"#,
  )?;
  let rows = stmt
    .query_map([transaction_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  for (wallet_id, currency_id, direction, amount) in rows {
    // Reverse: flip sign of original posting.
    let rev_dir = if direction.eq_ignore_ascii_case("DEBIT") {
      "CREDIT"
    } else {
      "DEBIT"
    };
    apply_balance_delta(conn, &wallet_id, &currency_id, rev_dir, amount, &value_date)?;
  }
  Ok(())
}

pub fn cached_wallet_totals(
  conn: &Connection,
  wallet_id: &str,
) -> Result<(i64, f64, Option<String>), AppError> {
  if !table_exists(conn, "WalletCurrencyBalance")? {
    return Ok((0, 0.0, None));
  }
  conn.query_row(
    r#"SELECT COUNT(*), COALESCE(SUM(balance), 0), MAX(lastValueDate)
       FROM WalletCurrencyBalance
       WHERE walletId = ?1 AND ABS(balance) > 1e-12"#,
    [wallet_id],
    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
  )
  .map_err(Into::into)
}
