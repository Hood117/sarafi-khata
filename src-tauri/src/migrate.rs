//! SQL migration runner.
//!
//! During Next→native cutover the same `saraf.db` may already have been
//! migrated by Prisma. On first native open we stamp existing SQL files as
//! applied (no re-run). After that, new `*.sql` files are executed normally.

use rusqlite::{Connection, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;

pub fn migrations_dir(resource_candidates: &[PathBuf]) -> Result<PathBuf, AppError> {
  for candidate in resource_candidates {
    if candidate.is_dir() {
      return Ok(candidate.clone());
    }
  }
  Err(AppError::Io(
    "migrations directory not found (expected src-tauri/migrations)".into(),
  ))
}

fn ensure_migrations_table(conn: &Connection) -> Result<(), AppError> {
  conn.execute_batch(
    "
    CREATE TABLE IF NOT EXISTS saraf_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ",
  )?;
  Ok(())
}

fn list_sql_files(migrations_path: &Path) -> Result<Vec<(String, PathBuf)>, AppError> {
  let mut entries = fs::read_dir(migrations_path)
    .map_err(|e| AppError::Io(format!("read migrations dir: {e}")))?
    .filter_map(|e| e.ok())
    .filter(|e| {
      e.path()
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("sql"))
    })
    .map(|e| {
      (
        e.file_name().to_string_lossy().to_string(),
        e.path(),
      )
    })
    .collect::<Vec<_>>();

  entries.sort_by(|a, b| a.0.cmp(&b.0));
  Ok(entries)
}

fn schema_already_present(conn: &Connection) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='User')",
    [],
    |row| row.get(0),
  )?;
  Ok(exists)
}

fn migration_count(conn: &Connection) -> Result<i64, AppError> {
  let n: i64 = conn.query_row("SELECT COUNT(*) FROM saraf_migrations", [], |row| {
    row.get(0)
  })?;
  Ok(n)
}

fn is_recorded(conn: &Connection, name: &str) -> Result<bool, AppError> {
  let already: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM saraf_migrations WHERE name = ?1)",
    [name],
    |row| row.get(0),
  )?;
  Ok(already)
}

fn stamp_all(conn: &Connection, files: &[(String, PathBuf)]) -> Result<usize, AppError> {
  let mut stamped = 0usize;
  for (name, _) in files {
    if !is_recorded(conn, name)? {
      conn.execute(
        "INSERT INTO saraf_migrations (name) VALUES (?1)",
        [name],
      )?;
      stamped += 1;
    }
  }
  Ok(stamped)
}

/// Apply pending migrations. Returns how many SQL files were executed.
pub fn apply_pending_migrations(
  conn: &Connection,
  migrations_path: &Path,
) -> Result<usize, AppError> {
  ensure_migrations_table(conn)?;
  let files = list_sql_files(migrations_path)?;

  // One-time Prisma cutover: existing schema + empty saraf_migrations → stamp only.
  if schema_already_present(conn)? && migration_count(conn)? == 0 {
    let stamped = stamp_all(conn, &files)?;
    log::info!(
      "existing Prisma schema detected; recorded {stamped} migration(s) without re-applying DDL"
    );
    return Ok(0);
  }

  let mut applied = 0usize;
  for (name, path) in files {
    if is_recorded(conn, &name)? {
      continue;
    }

    let sql = fs::read_to_string(&path)
      .map_err(|e| AppError::Io(format!("read migration {name}: {e}")))?;

    conn.execute_batch("BEGIN IMMEDIATE;")?;
    match apply_migration_sql(conn, &name, &sql) {
      Ok(()) => {
        conn.execute(
          "INSERT INTO saraf_migrations (name) VALUES (?1)",
          [&name],
        )?;
        conn.execute_batch("COMMIT;")?;
        applied += 1;
        log::info!("applied migration {name}");
      }
      Err(e) => {
        let _ = conn.execute_batch("ROLLBACK;");
        return Err(e);
      }
    }
  }

  Ok(applied)
}

/// SQLite has no `ADD COLUMN IF NOT EXISTS`. Schema repair may create columns
/// before a later migration file runs — treat duplicate/already-exists as OK.
fn is_benign_schema_error(err: &rusqlite::Error) -> bool {
  let msg = err.to_string().to_ascii_lowercase();
  msg.contains("duplicate column name")
    || msg.contains("already exists")
    || msg.contains("duplicate column")
}

fn apply_migration_sql(conn: &Connection, name: &str, sql: &str) -> Result<(), AppError> {
  // Prefer statement-by-statement so one duplicate column does not fail the file.
  let mut statements = Vec::new();
  let mut buf = String::new();
  for line in sql.lines() {
    let trimmed = line.trim();
    if trimmed.starts_with("--") {
      continue;
    }
    buf.push_str(line);
    buf.push('\n');
    if trimmed.ends_with(';') {
      let stmt = buf.trim().to_string();
      if !stmt.is_empty() {
        statements.push(stmt);
      }
      buf.clear();
    }
  }
  let tail = buf.trim().to_string();
  if !tail.is_empty() {
    statements.push(tail);
  }

  if statements.is_empty() {
    return Ok(());
  }

  for stmt in statements {
    match conn.execute_batch(&stmt) {
      Ok(()) => {}
      Err(e) if is_benign_schema_error(&e) => {
        log::warn!("migration {name}: ignoring benign schema error: {e}");
      }
      Err(e) => {
        return Err(AppError::Db(format!("migration {name} failed: {e}")));
      }
    }
  }
  Ok(())
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
    [table],
    |row| row.get(0),
  )?;
  Ok(exists)
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
  let sql = format!("PRAGMA table_info(\"{table}\")");
  let mut stmt = conn.prepare(&sql)?;
  let names = stmt
    .query_map([], |row| row.get::<_, String>(1))?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(names.iter().any(|n| n == column))
}

fn ensure_column(
  conn: &Connection,
  table: &str,
  column: &str,
  ddl: &str,
) -> Result<(), AppError> {
  if !table_exists(conn, table)? {
    return Ok(());
  }
  if table_has_column(conn, table, column)? {
    return Ok(());
  }
  conn.execute_batch(ddl)
    .map_err(|e| AppError::Db(format!("schema repair {table}.{column}: {e}")))?;
  log::info!("schema repair: added {table}.{column}");
  Ok(())
}

/// Repair columns that may be missing when Prisma cutover stamped migrations
/// without re-running ADD COLUMN DDL on an older live DB.
pub fn ensure_schema_compat(conn: &Connection) -> Result<(), AppError> {
  ensure_column(
    conn,
    "Customer",
    "address",
    r#"ALTER TABLE "Customer" ADD COLUMN "address" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Customer",
    "nationalId",
    r#"ALTER TABLE "Customer" ADD COLUMN "nationalId" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Customer",
    "fatherName",
    r#"ALTER TABLE "Customer" ADD COLUMN "fatherName" TEXT;
       CREATE INDEX IF NOT EXISTS "Customer_fatherName_idx" ON "Customer"("fatherName");"#,
  )?;
  ensure_column(
    conn,
    "Customer",
    "customerType",
    r#"ALTER TABLE "Customer" ADD COLUMN "customerType" TEXT NOT NULL DEFAULT 'PERMANENT';
       CREATE INDEX IF NOT EXISTS "Customer_customerType_idx" ON "Customer"("customerType");"#,
  )?;
  ensure_column(
    conn,
    "Customer",
    "fingerprintTemplate",
    r#"ALTER TABLE "Customer" ADD COLUMN "fingerprintTemplate" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Transaction",
    "walkInName",
    r#"ALTER TABLE "Transaction" ADD COLUMN "walkInName" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Transaction",
    "walkInPhone",
    r#"ALTER TABLE "Transaction" ADD COLUMN "walkInPhone" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Transaction",
    "displaySeq",
    r#"ALTER TABLE "Transaction" ADD COLUMN "displaySeq" INTEGER;"#,
  )?;
  ensure_column(
    conn,
    "Transaction",
    "displayRef",
    r#"ALTER TABLE "Transaction" ADD COLUMN "displayRef" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "User",
    "allowedScreens",
    r#"ALTER TABLE "User" ADD COLUMN "allowedScreens" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "User",
    "authPinHash",
    r#"ALTER TABLE "User" ADD COLUMN "authPinHash" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "User",
    "authPinFailCount",
    r#"ALTER TABLE "User" ADD COLUMN "authPinFailCount" INTEGER NOT NULL DEFAULT 0;"#,
  )?;
  ensure_column(
    conn,
    "User",
    "authPinLockedUntil",
    r#"ALTER TABLE "User" ADD COLUMN "authPinLockedUntil" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "User",
    "fingerprintTemplate",
    r#"ALTER TABLE "User" ADD COLUMN "fingerprintTemplate" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Wallet",
    "userId",
    r#"ALTER TABLE "Wallet" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
       CREATE INDEX IF NOT EXISTS "Wallet_userId_idx" ON "Wallet"("userId");"#,
  )?;
  ensure_column(
    conn,
    "Wallet",
    "partnerSarafiId",
    r#"ALTER TABLE "Wallet" ADD COLUMN "partnerSarafiId" TEXT;
       CREATE INDEX IF NOT EXISTS "Wallet_partnerSarafiId_idx" ON "Wallet"("partnerSarafiId");"#,
  )?;

  // Create HawalaTransfer (+ desk columns) before ALTER COLUMN repairs below.
  ensure_hawala_desk_schema(conn)?;

  ensure_column(
    conn,
    "HawalaTransfer",
    "senderCustomerId",
    r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "senderCustomerId" TEXT REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;"#,
  )?;
  ensure_column(
    conn,
    "HawalaTransfer",
    "receiverCustomerId",
    r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverCustomerId" TEXT REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;"#,
  )?;
  ensure_column(
    conn,
    "HawalaTransfer",
    "commissionRatePerAmount",
    r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "commissionRatePerAmount" DECIMAL;"#,
  )?;
  ensure_column(
    conn,
    "HawalaTransfer",
    "commissionRateFeeAmount",
    r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "commissionRateFeeAmount" DECIMAL;"#,
  )?;
  ensure_column(
    conn,
    "HawalaTransfer",
    "ownCommissionAmount",
    r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "ownCommissionAmount" DECIMAL;"#,
  )?;

  ensure_partner_sarafi_schema(conn)?;
  ensure_trading_module_schema(conn)?;
  ensure_owner_capital_event_schema(conn)?;
  ensure_business_day_schema(conn)?;
  ensure_exchange_deal_schema(conn)?;
  ensure_vault_management_schema(conn)?;
  ensure_market_rate_cache_schema(conn)?;
  ensure_system_setting_schema(conn)?;
  ensure_audit_log_schema(conn)?;
  ensure_default_currencies(conn)?;
  ensure_default_admin(conn)?;
  crate::commands::authorize::ensure_system_admin_protected(conn)?;
  ensure_single_main_vault_cash(conn)?;
  crate::ledger::ensure_account_number_schema(conn)?;
  crate::ledger::ensure_display_seq_schema(conn)?;
  crate::ledger::ensure_wallet_balance_cache(conn)?;
  ensure_hawala_auto_completed(conn)?;
  ensure_account_order_ledger_columns(conn)?;
  Ok(())
}

/// Account Orders ledger links (purchase / payout transactions + recipient customer).
/// No-op when the AccountOrder tables do not exist yet.
fn ensure_account_order_ledger_columns(conn: &Connection) -> Result<(), AppError> {
  ensure_column(
    conn,
    "AccountOrder",
    "transactionId",
    r#"ALTER TABLE "AccountOrder" ADD COLUMN "transactionId" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "AccountOrderRecipient",
    "customerId",
    r#"ALTER TABLE "AccountOrderRecipient" ADD COLUMN "customerId" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "AccountOrderRecipient",
    "payoutTransactionId",
    r#"ALTER TABLE "AccountOrderRecipient" ADD COLUMN "payoutTransactionId" TEXT;"#,
  )?;
  if table_exists(conn, "AccountOrder")? {
    conn
      .execute_batch(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS "AccountOrder_transactionId_key"
             ON "AccountOrder"("transactionId");"#,
      )
      .map_err(|e| AppError::Db(format!("schema repair AccountOrder index: {e}")))?;
  }
  if table_exists(conn, "AccountOrderRecipient")? {
    conn
      .execute_batch(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS "AccountOrderRecipient_payoutTransactionId_key"
             ON "AccountOrderRecipient"("payoutTransactionId");
           CREATE INDEX IF NOT EXISTS "AccountOrderRecipient_customerId_idx"
             ON "AccountOrderRecipient"("customerId");"#,
      )
      .map_err(|e| AppError::Db(format!("schema repair AccountOrderRecipient index: {e}")))?;
  }
  Ok(())
}

/// Older partner-corridor hawalas sat in SENT/RECEIVED until manually Completed.
/// Desk Send still posts COMPLETED. Desk Receive with a source account stays
/// PENDING until Complete Hawala pays Main Vault / the receiver account.
fn ensure_hawala_auto_completed(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "HawalaTransfer")? {
    return Ok(());
  }
  conn.execute(
    r#"UPDATE HawalaTransfer
       SET status = 'COMPLETED',
           completedAt = COALESCE(completedAt, updatedAt, createdAt, datetime('now')),
           updatedAt = datetime('now')
       WHERE deletedAt IS NULL
         AND UPPER(status) IN ('SENT', 'RECEIVED')"#,
    [],
  )?;
  Ok(())
}

/// Trading tables may be missing when Prisma cutover stamped
/// `20260807210000_trading_module.sql` without applying DDL.
fn ensure_trading_module_schema(conn: &Connection) -> Result<(), AppError> {
  if table_exists(conn, "TradingTrade")?
    && table_exists(conn, "TradingInventory")?
    && table_exists(conn, "TradingMarketRate")?
  {
    return Ok(());
  }

  conn
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "TradingInventory" (
        "currencyId" TEXT NOT NULL PRIMARY KEY,
        "quantity" DECIMAL NOT NULL DEFAULT 0,
        "avgCost" DECIMAL NOT NULL DEFAULT 0,
        "avgCostCurrencyId" TEXT NOT NULL,
        "costValue" DECIMAL NOT NULL DEFAULT 0,
        "lastPurchaseAt" DATETIME,
        "lastSaleAt" DATETIME,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "TradingInventory_currencyId_fkey"
          FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingInventory_avgCostCurrencyId_fkey"
          FOREIGN KEY ("avgCostCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "TradingTrade" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reference" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'POSTED',
        "inventoryCurrencyId" TEXT NOT NULL,
        "quantity" DECIMAL NOT NULL,
        "rate" DECIMAL NOT NULL,
        "paymentCurrencyId" TEXT NOT NULL,
        "paymentAmount" DECIMAL NOT NULL,
        "counterpartyType" TEXT NOT NULL,
        "customerId" TEXT,
        "partnerSarafiId" TEXT,
        "counterpartyName" TEXT,
        "cashWalletId" TEXT NOT NULL,
        "avgCostAtPost" DECIMAL,
        "cogsAmount" DECIMAL,
        "grossProfit" DECIMAL,
        "inventoryQtyAfter" DECIMAL,
        "notes" TEXT,
        "transactionId" TEXT,
        "valueDate" DATETIME NOT NULL,
        "createdById" TEXT,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "TradingTrade_reference_key" UNIQUE ("reference"),
        CONSTRAINT "TradingTrade_inventoryCurrencyId_fkey"
          FOREIGN KEY ("inventoryCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_paymentCurrencyId_fkey"
          FOREIGN KEY ("paymentCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_partnerSarafiId_fkey"
          FOREIGN KEY ("partnerSarafiId") REFERENCES "PartnerSarafi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_cashWalletId_fkey"
          FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_transactionId_fkey"
          FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingTrade_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "TradingTrade_transactionId_key" ON "TradingTrade"("transactionId");
      CREATE INDEX IF NOT EXISTS "TradingTrade_deletedAt_direction_valueDate_idx"
        ON "TradingTrade"("deletedAt", "direction", "valueDate");
      CREATE INDEX IF NOT EXISTS "TradingTrade_inventoryCurrencyId_valueDate_idx"
        ON "TradingTrade"("inventoryCurrencyId", "valueDate");
      CREATE INDEX IF NOT EXISTS "TradingTrade_partnerSarafiId_valueDate_idx"
        ON "TradingTrade"("partnerSarafiId", "valueDate");
      CREATE INDEX IF NOT EXISTS "TradingTrade_customerId_valueDate_idx"
        ON "TradingTrade"("customerId", "valueDate");

      CREATE TABLE IF NOT EXISTS "TradingMarketRate" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "currencyId" TEXT NOT NULL,
        "buyRate" DECIMAL NOT NULL,
        "sellRate" DECIMAL NOT NULL,
        "marketRate" DECIMAL NOT NULL,
        "source" TEXT,
        "updatedById" TEXT,
        "effectiveAt" DATETIME NOT NULL,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "TradingMarketRate_currencyId_fkey"
          FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "TradingMarketRate_updatedById_fkey"
          FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "TradingMarketRate_currencyId_effectiveAt_idx"
        ON "TradingMarketRate"("currencyId", "effectiveAt");
      CREATE INDEX IF NOT EXISTS "TradingMarketRate_deletedAt_effectiveAt_idx"
        ON "TradingMarketRate"("deletedAt", "effectiveAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair TradingTrade: {e}")))?;
  log::info!("schema repair: created trading module tables");
  Ok(())
}

fn ensure_system_setting_schema(conn: &Connection) -> Result<(), AppError> {
  if table_exists(conn, "SystemSetting")? {
    return Ok(());
  }
  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key");
    "#,
  )
  .map_err(|e| AppError::Db(format!("schema repair SystemSetting: {e}")))?;
  log::info!("schema repair: created SystemSetting table");
  Ok(())
}

fn ensure_audit_log_schema(conn: &Connection) -> Result<(), AppError> {
  if table_exists(conn, "AuditLog")? {
    return Ok(());
  }
  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT,
      "action" TEXT NOT NULL,
      "module" TEXT NOT NULL,
      "entityType" TEXT,
      "entityId" TEXT,
      "ipAddress" TEXT,
      "beforeValues" TEXT,
      "afterValues" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx"
      ON "AuditLog"("entityType", "entityId");
    "#,
  )
  .map_err(|e| AppError::Db(format!("schema repair AuditLog: {e}")))?;
  log::info!("schema repair: created AuditLog table");
  Ok(())
}

/// HawalaTransfer + desk columns / events may be stamped without DDL on cutover.
fn ensure_hawala_desk_schema(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "HawalaTransfer")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "HawalaTransfer" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reference" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "senderName" TEXT NOT NULL,
        "senderPhone" TEXT,
        "receiverName" TEXT NOT NULL,
        "receiverPhone" TEXT,
        "partnerSarafi" TEXT NOT NULL,
        "originCity" TEXT NOT NULL,
        "originCountry" TEXT NOT NULL,
        "destinationCity" TEXT NOT NULL,
        "destinationCountry" TEXT NOT NULL,
        "currencyId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "notes" TEXT,
        "customerId" TEXT,
        "cashWalletId" TEXT NOT NULL,
        "clearingWalletId" TEXT NOT NULL,
        "transactionId" TEXT,
        "createdById" TEXT NOT NULL,
        "valueDate" DATETIME NOT NULL,
        "completedAt" DATETIME,
        "cancelledAt" DATETIME,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "HawalaTransfer_reference_key" ON "HawalaTransfer"("reference");
      CREATE UNIQUE INDEX IF NOT EXISTS "HawalaTransfer_transactionId_key" ON "HawalaTransfer"("transactionId");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_status_valueDate_idx" ON "HawalaTransfer"("status", "valueDate");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_direction_status_idx" ON "HawalaTransfer"("direction", "status");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_customerId_valueDate_idx" ON "HawalaTransfer"("customerId", "valueDate");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_deletedAt_idx" ON "HawalaTransfer"("deletedAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair HawalaTransfer: {e}")))?;
    log::info!("schema repair: created HawalaTransfer table");
  }

  let desk_cols: &[(&str, &str)] = &[
    ("senderNationalId", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "senderNationalId" TEXT;"#),
    ("senderAddress", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "senderAddress" TEXT;"#),
    ("receiverNationalId", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverNationalId" TEXT;"#),
    ("receiverAddress", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverAddress" TEXT;"#),
    ("receiverReference", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverReference" TEXT;"#),
    ("partnerBranch", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "partnerBranch" TEXT;"#),
    ("specialInstructions", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "specialInstructions" TEXT;"#),
    ("purpose", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "purpose" TEXT;"#),
    ("priority", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';"#),
    ("expectedDeliveryDate", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "expectedDeliveryDate" DATETIME;"#),
    ("expectedDeliveryTime", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "expectedDeliveryTime" TEXT;"#),
    ("receiveCurrencyId", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiveCurrencyId" TEXT;"#),
    ("receiveAmount", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receiveAmount" DECIMAL;"#),
    ("exchangeRate", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "exchangeRate" DECIMAL;"#),
    ("additionalCharges", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "additionalCharges" DECIMAL;"#),
    ("discountAmount", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "discountAmount" DECIMAL;"#),
    ("ownCommissionMode", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "ownCommissionMode" TEXT;"#),
    ("partnerCommissionMode", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "partnerCommissionMode" TEXT;"#),
    ("settlementType", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementType" TEXT;"#),
    ("settlementDate", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementDate" DATETIME;"#),
    ("settlementNotes", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementNotes" TEXT;"#),
    ("internalNotes", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "internalNotes" TEXT;"#),
    ("customerNotes", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "customerNotes" TEXT;"#),
    ("privateNotes", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "privateNotes" TEXT;"#),
    ("sentAt", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "sentAt" DATETIME;"#),
    ("receivedAt", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "receivedAt" DATETIME;"#),
    ("returnedAt", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "returnedAt" DATETIME;"#),
    ("payoutTransactionId", r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "payoutTransactionId" TEXT;"#),
    (
      "collectorFingerprintTemplate",
      r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "collectorFingerprintTemplate" TEXT;"#,
    ),
  ];
  for (col, ddl) in desk_cols {
    ensure_column(conn, "HawalaTransfer", col, ddl)?;
  }
  let _ = conn.execute_batch(
    r#"
    CREATE INDEX IF NOT EXISTS "HawalaTransfer_status_priority_idx"
      ON "HawalaTransfer"("status", "priority");
    CREATE INDEX IF NOT EXISTS "HawalaTransfer_purpose_idx"
      ON "HawalaTransfer"("purpose");
    CREATE INDEX IF NOT EXISTS "HawalaTransfer_destinationCountry_city_idx"
      ON "HawalaTransfer"("destinationCountry", "destinationCity");
    "#,
  );

  if !table_exists(conn, "HawalaEvent")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "HawalaEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "hawalaTransferId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "fromStatus" TEXT,
        "toStatus" TEXT,
        "summary" TEXT NOT NULL,
        "oldValue" TEXT,
        "newValue" TEXT,
        "reason" TEXT,
        "actorUserId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "HawalaEvent_hawalaTransferId_createdAt_idx"
        ON "HawalaEvent"("hawalaTransferId", "createdAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair HawalaEvent: {e}")))?;
    log::info!("schema repair: created HawalaEvent table");
  }

  if !table_exists(conn, "HawalaAttachment")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "HawalaAttachment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "hawalaTransferId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "mimeType" TEXT,
        "sizeBytes" INTEGER,
        "storagePath" TEXT NOT NULL,
        "notes" TEXT,
        "uploadedById" TEXT,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "HawalaAttachment_hawalaTransferId_deletedAt_idx"
        ON "HawalaAttachment"("hawalaTransferId", "deletedAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair HawalaAttachment: {e}")))?;
    log::info!("schema repair: created HawalaAttachment table");
  }
  Ok(())
}

/// First-run desk login for empty installs: `Saraf@@` / `Saraf@@!!77`.
/// Give these privately to the client; login UI does not prefill them.
/// Instruct the client to change the password after first login.
/// Migrates legacy `admin` to the new username and password once.
/// If `Saraf@@` exists but the default password does not verify and the account
/// has never successfully logged in, re-apply the default password (repairs
/// broken/partial seeds without wiping a password the client already changed).
fn ensure_default_admin(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "User")? {
    return Ok(());
  }

  let username = crate::commands::authorize::system_admin_username();
  let password = crate::commands::authorize::system_admin_password();
  let now = chrono::Utc::now()
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string();

  let existing: Option<(String, String)> = conn
    .query_row(
      r#"SELECT id, username FROM "User"
         WHERE lower(username) = lower(?1)
            OR lower(username) = 'admin'
         ORDER BY CASE WHEN lower(username) = lower(?1) THEN 0 ELSE 1 END
         LIMIT 1"#,
      [username],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| AppError::Db(format!("lookup system admin: {e}")))?;

  if let Some((id, current_username)) = existing {
    if current_username.eq_ignore_ascii_case("admin") {
      let password_hash = bcrypt::hash(password, 12)
        .map_err(|e| AppError::Internal(format!("default admin hash: {e}")))?;
      conn
        .execute(
          r#"UPDATE "User"
             SET username = ?1,
                 passwordHash = ?2,
                 fullName = COALESCE(NULLIF(trim(fullName), ''), 'System Administrator'),
                 role = 'ADMIN',
                 isActive = 1,
                 allowedScreens = NULL,
                 updatedAt = ?3
             WHERE id = ?4"#,
          rusqlite::params![username, password_hash, now, id],
        )
        .map_err(|e| AppError::Db(format!("migrate system admin: {e}")))?;
      log::info!("migrated legacy admin login to {username}");
      return Ok(());
    }

    // Already Saraf@@ — repair default password only before first successful login.
    let password_hash: String = conn
      .query_row(
        r#"SELECT passwordHash FROM "User" WHERE id = ?1"#,
        [&id],
        |row| row.get(0),
      )
      .map_err(|e| AppError::Db(format!("read system admin hash: {e}")))?;
    let default_ok = bcrypt::verify(password.as_bytes(), &password_hash).unwrap_or(false);
    if !default_ok {
      let prior_logins: i64 = if table_exists(conn, "Session")? {
        conn
          .query_row(
            r#"SELECT COUNT(*) FROM Session WHERE userId = ?1"#,
            [&id],
            |row| row.get(0),
          )
          .map_err(|e| AppError::Db(format!("count admin sessions: {e}")))?
      } else {
        0
      };
      if prior_logins == 0 {
        let password_hash = bcrypt::hash(password, 12)
          .map_err(|e| AppError::Internal(format!("default admin hash: {e}")))?;
        conn
          .execute(
            r#"UPDATE "User"
               SET passwordHash = ?1,
                   role = 'ADMIN',
                   isActive = 1,
                   allowedScreens = NULL,
                   updatedAt = ?2
               WHERE id = ?3"#,
            rusqlite::params![password_hash, now, id],
          )
          .map_err(|e| AppError::Db(format!("repair system admin password: {e}")))?;
        log::info!("repaired default admin password for {username} (no prior login)");
      }
    }
    return Ok(());
  }

  // No system admin row — always create it (even if other users already exist).
  let password_hash = bcrypt::hash(password, 12)
    .map_err(|e| AppError::Internal(format!("default admin hash: {e}")))?;
  let id = uuid::Uuid::new_v4().to_string();
  conn
    .execute(
      r#"INSERT INTO "User"
         (id, fullName, username, passwordHash, role, isActive, allowedScreens, createdAt, updatedAt)
         VALUES (?1, 'System Administrator', ?2, ?3, 'ADMIN', 1, NULL, ?4, ?4)"#,
      rusqlite::params![id, username, password_hash, now],
    )
    .map_err(|e| AppError::Db(format!("seed default admin: {e}")))?;

  log::info!("seeded default admin user ({username})");
  Ok(())
}

/// One physical shop cash drawer: Main Vault only.
/// Moves residual VAULT/TILL balances into Main Vault, deactivates Cash Till / extras.
/// Does NOT touch SYSTEM wallets (Hawala Clearing, Exchange Difference, …).
fn ensure_single_main_vault_cash(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "Wallet")? {
    return Ok(());
  }
  crate::ledger::consolidate_shop_cash_into_main_vault(conn)?;
  Ok(())
}

/// Ensure the standard shop currencies exist.
///
/// Inserts any missing default codes. Never reactivates or undeletes currencies
/// the operator has turned off — that must survive app restart.
fn ensure_default_currencies(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "Currency")? {
    return Ok(());
  }

  const DEFAULTS: &[(&str, &str, &str, i64)] = &[
    ("AFN", "Afghan Afghani", "Afs", 2),
    ("PKR", "Pakistani Rupee", "Rs", 2),
    ("IRR", "Iranian Rial", "Rl", 0),
    ("INR", "Indian Rupee", "₹", 2),
    ("TRY", "Turkish Lira", "₺", 2),
    ("SAR", "Saudi Riyal", "SR", 2),
    ("AED", "UAE Dirham", "Dh", 2),
    ("QAR", "Qatari Riyal", "QR", 2),
    ("OMR", "Omani Rial", "OR", 3),
    ("KWD", "Kuwaiti Dinar", "KD", 3),
    ("USD", "US Dollar", "$", 2),
    ("EUR", "Euro", "€", 2),
    ("GBP", "British Pound", "£", 2),
    ("CHF", "Swiss Franc", "CHF", 2),
    ("JPY", "Japanese Yen", "¥", 0),
    ("CNY", "Chinese Yuan", "¥", 2),
    ("CAD", "Canadian Dollar", "C$", 2),
    ("AUD", "Australian Dollar", "A$", 2),
    ("RUB", "Russian Ruble", "₽", 2),
    ("SGD", "Singapore Dollar", "S$", 2),
    ("MYR", "Malaysian Ringgit", "RM", 2),
  ];

  let now = chrono::Utc::now()
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string();

  for &(code, name, symbol, places) in DEFAULTS {
    let exists: bool = conn
      .query_row(
        "SELECT EXISTS(SELECT 1 FROM Currency WHERE code = ?1 LIMIT 1)",
        [code],
        |row| row.get(0),
      )
      .map_err(|e| AppError::Db(format!("currency lookup {code}: {e}")))?;

    if exists {
      // Preserve operator isActive / deletedAt choices across restarts.
      continue;
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn
      .execute(
        r#"INSERT INTO Currency
           (id, code, name, symbol, decimalPlaces, isActive, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, 1, NULL, ?6, ?6)"#,
        rusqlite::params![id, code, name, symbol, places, now],
      )
      .map_err(|e| AppError::Db(format!("currency insert {code}: {e}")))?;
  }

  Ok(())
}

fn ensure_vault_management_schema(conn: &Connection) -> Result<(), AppError> {
  ensure_column(
    conn,
    "Wallet",
    "code",
    r#"ALTER TABLE "Wallet" ADD COLUMN "code" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Wallet",
    "location",
    r#"ALTER TABLE "Wallet" ADD COLUMN "location" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Wallet",
    "description",
    r#"ALTER TABLE "Wallet" ADD COLUMN "description" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Wallet",
    "notes",
    r#"ALTER TABLE "Wallet" ADD COLUMN "notes" TEXT;"#,
  )?;

  if !table_exists(conn, "CurrencyDenomination")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "CurrencyDenomination" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "currencyId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "value" DECIMAL NOT NULL,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "CurrencyDenomination_currencyId_sortOrder_idx"
        ON "CurrencyDenomination"("currencyId", "sortOrder");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair CurrencyDenomination: {e}")))?;
  }

  if !table_exists(conn, "VaultReconciliation")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "VaultReconciliation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "walletId" TEXT NOT NULL,
        "businessDayId" TEXT,
        "businessDate" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "differenceReason" TEXT,
        "notes" TEXT,
        "createdById" TEXT,
        "confirmedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "VaultReconciliation_walletId_businessDate_idx"
        ON "VaultReconciliation"("walletId", "businessDate");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair VaultReconciliation: {e}")))?;
    log::info!("schema repair: created VaultReconciliation table");
  }

  if !table_exists(conn, "VaultReconciliationLine")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "VaultReconciliationLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reconciliationId" TEXT NOT NULL,
        "currencyId" TEXT NOT NULL,
        "expectedAmount" DECIMAL NOT NULL DEFAULT 0,
        "physicalAmount" DECIMAL NOT NULL DEFAULT 0,
        "difference" DECIMAL NOT NULL DEFAULT 0,
        "denominationJson" TEXT,
        "reason" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "VaultReconciliationLine_recon_currency_key"
        ON "VaultReconciliationLine"("reconciliationId", "currencyId");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair VaultReconciliationLine: {e}")))?;
    log::info!("schema repair: created VaultReconciliationLine table");
  }
  Ok(())
}

fn ensure_exchange_deal_schema(conn: &Connection) -> Result<(), AppError> {
  // Ensure Exchange Difference system wallet exists for 4-leg posts.
  let has_diff: bool = conn.query_row(
    "SELECT EXISTS(
       SELECT 1 FROM Wallet
       WHERE name = 'Exchange Difference' AND type = 'SYSTEM' AND deletedAt IS NULL
     )",
    [],
    |row| row.get(0),
  )?;
  if !has_diff {
    let now = chrono::Utc::now()
      .format("%Y-%m-%d %H:%M:%S%.3f")
      .to_string();
    conn.execute(
      r#"INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt)
         VALUES (?1, 'Exchange Difference', 'SYSTEM', NULL, NULL, 1, NULL, ?2, ?2)"#,
      rusqlite::params![uuid::Uuid::new_v4().to_string(), now],
    )
    .map_err(|e| AppError::Db(format!("schema repair Exchange Difference wallet: {e}")))?;
    log::info!("schema repair: created Exchange Difference wallet");
  }

  if table_exists(conn, "ExchangeDeal")? {
    return Ok(());
  }
  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS "ExchangeDeal" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "transactionId" TEXT NOT NULL,
      "fromCurrencyId" TEXT NOT NULL,
      "toCurrencyId" TEXT NOT NULL,
      "fromAmount" DECIMAL NOT NULL,
      "toAmount" DECIMAL NOT NULL,
      "highCurrencyId" TEXT NOT NULL,
      "lowCurrencyId" TEXT NOT NULL,
      "dealRate" DECIMAL NOT NULL,
      "boardRate" DECIMAL,
      "side" TEXT NOT NULL,
      "profitAmount" DECIMAL NOT NULL DEFAULT 0,
      "profitCurrencyId" TEXT NOT NULL,
      "valueDate" DATETIME NOT NULL,
      "createdById" TEXT,
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeDeal_transactionId_key"
      ON "ExchangeDeal"("transactionId");
    CREATE INDEX IF NOT EXISTS "ExchangeDeal_valueDate_idx"
      ON "ExchangeDeal"("valueDate");
    CREATE INDEX IF NOT EXISTS "ExchangeDeal_deletedAt_valueDate_idx"
      ON "ExchangeDeal"("deletedAt", "valueDate");
    "#,
  )
  .map_err(|e| AppError::Db(format!("schema repair ExchangeDeal: {e}")))?;
  log::info!("schema repair: created ExchangeDeal table");
  Ok(())
}

fn ensure_business_day_schema(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "BusinessDay")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "BusinessDay" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessDate" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "openedAt" DATETIME NOT NULL,
        "openedById" TEXT,
        "closedAt" DATETIME,
        "closedById" TEXT,
        "differenceReason" TEXT,
        "notes" TEXT,
        "transactionCount" INTEGER,
        "profitSnapshot" TEXT,
        "expenseSnapshot" TEXT,
        "hasCashDifference" BOOLEAN NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDay_businessDate_key"
        ON "BusinessDay"("businessDate");
      CREATE INDEX IF NOT EXISTS "BusinessDay_status_businessDate_idx"
        ON "BusinessDay"("status", "businessDate");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair BusinessDay: {e}")))?;
    log::info!("schema repair: created BusinessDay table");
  }

  if !table_exists(conn, "BusinessDayCashCount")? {
    conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS "BusinessDayCashCount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessDayId" TEXT NOT NULL,
        "currencyId" TEXT NOT NULL,
        "currencyCode" TEXT NOT NULL,
        "openingAmount" DECIMAL NOT NULL DEFAULT 0,
        "cashReceived" DECIMAL NOT NULL DEFAULT 0,
        "cashPaid" DECIMAL NOT NULL DEFAULT 0,
        "expectedClosing" DECIMAL NOT NULL DEFAULT 0,
        "actualClosing" DECIMAL,
        "difference" DECIMAL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE CASCADE,
        FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDayCashCount_day_currency_key"
        ON "BusinessDayCashCount"("businessDayId", "currencyId");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair BusinessDayCashCount: {e}")))?;
    log::info!("schema repair: created BusinessDayCashCount table");
  }
  Ok(())
}

fn ensure_market_rate_cache_schema(conn: &Connection) -> Result<(), AppError> {
  if table_exists(conn, "MarketRateCache")? {
    return Ok(());
  }
  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS "MarketRateCache" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "baseCode" TEXT NOT NULL,
      "fetchedAt" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "providerTime" TEXT,
      "payloadJson" TEXT NOT NULL,
      "lastError" TEXT
    );
    "#,
  )
  .map_err(|e| AppError::Db(format!("schema repair MarketRateCache: {e}")))?;
  log::info!("schema repair: created MarketRateCache table");
  Ok(())
}

fn ensure_owner_capital_event_schema(conn: &Connection) -> Result<(), AppError> {
  if table_exists(conn, "OwnerCapitalEvent")? {
    return Ok(());
  }
  conn.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS "OwnerCapitalEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "currencyId" TEXT NOT NULL,
      "amount" DECIMAL NOT NULL,
      "cashWalletId" TEXT,
      "transactionId" TEXT,
      "notes" TEXT,
      "reason" TEXT,
      "createdById" TEXT,
      "valueDate" DATETIME NOT NULL,
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "OwnerCapitalEvent_currencyId_fkey"
        FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "OwnerCapitalEvent_cashWalletId_fkey"
        FOREIGN KEY ("cashWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "OwnerCapitalEvent_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "OwnerCapitalEvent_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_valueDate_idx"
      ON "OwnerCapitalEvent"("valueDate");
    CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_kind_valueDate_idx"
      ON "OwnerCapitalEvent"("kind", "valueDate");
    CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_currencyId_idx"
      ON "OwnerCapitalEvent"("currencyId");
    CREATE UNIQUE INDEX IF NOT EXISTS "OwnerCapitalEvent_transactionId_key"
      ON "OwnerCapitalEvent"("transactionId");
    "#,
  )
  .map_err(|e| AppError::Db(format!("schema repair OwnerCapitalEvent: {e}")))?;
  log::info!("schema repair: created OwnerCapitalEvent table");
  Ok(())
}

/// PartnerSarafi may be missing when Prisma cutover stamped migrations without
/// applying `20260802210000_add_partner_sarafi.sql` on an older live DB.
fn ensure_partner_sarafi_schema(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "PartnerSarafi")? {
    conn.execute_batch(
      r#"
      CREATE TABLE "PartnerSarafi" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "phone" TEXT,
        "city" TEXT,
        "country" TEXT,
        "notes" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
        "commissionPerAmount" DECIMAL,
        "commissionFeeAmount" DECIMAL,
        "commissionCurrencyId" TEXT,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "PartnerSarafi_commissionCurrencyId_fkey"
          FOREIGN KEY ("commissionCurrencyId") REFERENCES "Currency" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "PartnerSarafi_name_idx" ON "PartnerSarafi"("name");
      CREATE INDEX IF NOT EXISTS "PartnerSarafi_isActive_deletedAt_idx"
        ON "PartnerSarafi"("isActive", "deletedAt");
      CREATE INDEX IF NOT EXISTS "PartnerSarafi_deletedAt_idx" ON "PartnerSarafi"("deletedAt");
      CREATE INDEX IF NOT EXISTS "PartnerSarafi_commissionCurrencyId_idx"
        ON "PartnerSarafi"("commissionCurrencyId");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair PartnerSarafi: {e}")))?;
    log::info!("schema repair: created PartnerSarafi table");
  } else {
    ensure_column(
      conn,
      "PartnerSarafi",
      "commissionEnabled",
      r#"ALTER TABLE "PartnerSarafi" ADD COLUMN "commissionEnabled" BOOLEAN NOT NULL DEFAULT false;"#,
    )?;
    ensure_column(
      conn,
      "PartnerSarafi",
      "commissionPerAmount",
      r#"ALTER TABLE "PartnerSarafi" ADD COLUMN "commissionPerAmount" DECIMAL;"#,
    )?;
    ensure_column(
      conn,
      "PartnerSarafi",
      "commissionFeeAmount",
      r#"ALTER TABLE "PartnerSarafi" ADD COLUMN "commissionFeeAmount" DECIMAL;"#,
    )?;
    ensure_column(
      conn,
      "PartnerSarafi",
      "commissionCurrencyId",
      r#"ALTER TABLE "PartnerSarafi" ADD COLUMN "commissionCurrencyId" TEXT;"#,
    )?;
    ensure_column(
      conn,
      "PartnerSarafi",
      "customerId",
      r#"ALTER TABLE "PartnerSarafi" ADD COLUMN "customerId" TEXT;"#,
    )?;
    let _ = conn.execute_batch(
      r#"
      CREATE INDEX IF NOT EXISTS "PartnerSarafi_customerId_idx"
        ON "PartnerSarafi"("customerId");
      CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSarafi_customerId_live_key"
        ON "PartnerSarafi"("customerId")
        WHERE "customerId" IS NOT NULL AND "deletedAt" IS NULL;
      "#,
    );
  }

  if table_exists(conn, "HawalaTransfer")? {
    ensure_column(
      conn,
      "HawalaTransfer",
      "partnerSarafiId",
      r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "partnerSarafiId" TEXT;"#,
    )?;
    ensure_column(
      conn,
      "HawalaTransfer",
      "commissionAmount",
      r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "commissionAmount" DECIMAL;"#,
    )?;
    ensure_column(
      conn,
      "HawalaTransfer",
      "commissionCurrencyId",
      r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "commissionCurrencyId" TEXT;"#,
    )?;
    ensure_column(
      conn,
      "HawalaTransfer",
      "commissionSide",
      r#"ALTER TABLE "HawalaTransfer" ADD COLUMN "commissionSide" TEXT;"#,
    )?;
    let _ = conn.execute_batch(
      r#"CREATE INDEX IF NOT EXISTS "HawalaTransfer_commissionCurrencyId_idx"
         ON "HawalaTransfer"("commissionCurrencyId");
         CREATE INDEX IF NOT EXISTS "HawalaTransfer_commissionSide_idx"
         ON "HawalaTransfer"("commissionSide");"#,
    );

    // Backfill catalog from existing free-text partner names (idempotent).
    let _ = conn.execute_batch(
      r#"
      INSERT INTO "PartnerSarafi" ("id", "name", "isActive", "createdAt", "updatedAt")
      SELECT
        'ps-' || lower(hex(randomblob(8))),
        names."partnerSarafi",
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT trim("partnerSarafi") AS "partnerSarafi"
        FROM "HawalaTransfer"
        WHERE trim(IFNULL("partnerSarafi", '')) <> ''
          AND "partnerSarafiId" IS NULL
      ) AS names
      WHERE NOT EXISTS (
        SELECT 1 FROM "PartnerSarafi" p
        WHERE lower(trim(p."name")) = lower(names."partnerSarafi")
      );

      UPDATE "HawalaTransfer"
      SET "partnerSarafiId" = (
        SELECT "id" FROM "PartnerSarafi"
        WHERE "PartnerSarafi"."name" = "HawalaTransfer"."partnerSarafi"
          AND "PartnerSarafi"."deletedAt" IS NULL
        LIMIT 1
      )
      WHERE "partnerSarafiId" IS NULL
        AND trim(IFNULL("partnerSarafi", '')) <> '';
      "#,
    );
  }

  if !table_exists(conn, "PartnerCommissionSettlement")? {
    conn.execute_batch(
      r#"
      CREATE TABLE "PartnerCommissionSettlement" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "partnerSarafiId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "balanceType" TEXT NOT NULL DEFAULT 'COMMISSION',
        "currencyId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "cashWalletId" TEXT NOT NULL,
        "transactionId" TEXT NOT NULL,
        "notes" TEXT,
        "valueDate" DATETIME NOT NULL,
        "createdById" TEXT NOT NULL,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "PartnerCommissionSettlement_partnerSarafiId_fkey"
          FOREIGN KEY ("partnerSarafiId") REFERENCES "PartnerSarafi" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "PartnerCommissionSettlement_currencyId_fkey"
          FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "PartnerCommissionSettlement_cashWalletId_fkey"
          FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "PartnerCommissionSettlement_transactionId_fkey"
          FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "PartnerCommissionSettlement_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommissionSettlement_transactionId_key"
        ON "PartnerCommissionSettlement"("transactionId");
      CREATE INDEX IF NOT EXISTS "PartnerCommissionSettlement_partnerSarafiId_valueDate_idx"
        ON "PartnerCommissionSettlement"("partnerSarafiId", "valueDate");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair PartnerCommissionSettlement: {e}")))?;
    log::info!("schema repair: created PartnerCommissionSettlement table");
  }

  ensure_column(
    conn,
    "PartnerCommissionSettlement",
    "balanceType",
    r#"ALTER TABLE "PartnerCommissionSettlement" ADD COLUMN "balanceType" TEXT NOT NULL DEFAULT 'COMMISSION';"#,
  )?;
  ensure_column(
    conn,
    "PartnerCommissionSettlement",
    "deletedAt",
    r#"ALTER TABLE "PartnerCommissionSettlement" ADD COLUMN "deletedAt" DATETIME;"#,
  )?;

  // Performance indexes for daybook / cash / hawala / customer lists (idempotent).
  conn
    .execute_batch(
      r#"
      CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_valueDate_idx"
        ON "Transaction"("deletedAt", "valueDate");
      CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_type_valueDate_idx"
        ON "Transaction"("deletedAt", "type", "valueDate");
      CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_status_valueDate_idx"
        ON "Transaction"("deletedAt", "status", "valueDate");
      CREATE INDEX IF NOT EXISTS "Transaction_customerId_deletedAt_valueDate_idx"
        ON "Transaction"("customerId", "deletedAt", "valueDate");
      CREATE INDEX IF NOT EXISTS "Transaction_type_deletedAt_valueDate_createdAt_idx"
        ON "Transaction"("type", "deletedAt", "valueDate", "createdAt");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_walletId_currencyId_idx"
        ON "LedgerEntry"("walletId", "currencyId");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_transactionId_createdAt_idx"
        ON "LedgerEntry"("transactionId", "createdAt");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_walletId_currencyId_createdAt_idx"
        ON "LedgerEntry"("walletId", "currencyId", "createdAt");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_walletId_transactionId_idx"
        ON "LedgerEntry"("walletId", "transactionId");
      CREATE INDEX IF NOT EXISTS "Wallet_name_type_idx"
        ON "Wallet"("name", "type");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_deletedAt_valueDate_idx"
        ON "HawalaTransfer"("deletedAt", "valueDate");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_partnerSarafiId_status_idx"
        ON "HawalaTransfer"("partnerSarafiId", "status");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_deletedAt_status_idx"
        ON "HawalaTransfer"("deletedAt", "status");
      CREATE INDEX IF NOT EXISTS "Wallet_type_deletedAt_idx"
        ON "Wallet"("type", "deletedAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair performance indexes: {e}")))?;

  ensure_employee_tables(conn)?;

  Ok(())
}

fn ensure_employee_tables(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "Employee")? || !table_exists(conn, "EmployeeSalaryPayment")? {
    conn
      .execute_batch(
        r#"
    CREATE TABLE IF NOT EXISTS "Employee" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "fullName" TEXT NOT NULL,
      "fatherName" TEXT,
      "nationalId" TEXT,
      "idNumber" TEXT,
      "dateOfBirth" TEXT,
      "address" TEXT,
      "phone" TEXT,
      "title" TEXT,
      "notes" TEXT,
      "startDate" TEXT,
      "monthlySalary" TEXT,
      "salaryCurrencyCode" TEXT,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "Employee_isActive_fullName_idx"
      ON "Employee"("isActive", "fullName");
    CREATE INDEX IF NOT EXISTS "Employee_deletedAt_idx"
      ON "Employee"("deletedAt");

    CREATE TABLE IF NOT EXISTS "EmployeeSalaryPayment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "employeeId" TEXT NOT NULL,
      "currencyId" TEXT NOT NULL,
      "amount" DECIMAL NOT NULL,
      "cashWalletId" TEXT NOT NULL,
      "transactionId" TEXT NOT NULL,
      "notes" TEXT,
      "valueDate" DATETIME NOT NULL,
      "createdById" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "EmployeeSalaryPayment_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EmployeeSalaryPayment_currencyId_fkey"
        FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EmployeeSalaryPayment_cashWalletId_fkey"
        FOREIGN KEY ("cashWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EmployeeSalaryPayment_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EmployeeSalaryPayment_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSalaryPayment_transactionId_key"
      ON "EmployeeSalaryPayment"("transactionId");
    CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_employeeId_valueDate_idx"
      ON "EmployeeSalaryPayment"("employeeId", "valueDate");
    CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_valueDate_idx"
      ON "EmployeeSalaryPayment"("valueDate");
    CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_currencyId_idx"
      ON "EmployeeSalaryPayment"("currencyId");
    "#,
      )
      .map_err(|e| AppError::Db(format!("schema repair Employee tables: {e}")))?;
    log::info!("schema repair: created Employee tables");
  }

  ensure_column(
    conn,
    "Employee",
    "fatherName",
    r#"ALTER TABLE "Employee" ADD COLUMN "fatherName" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "nationalId",
    r#"ALTER TABLE "Employee" ADD COLUMN "nationalId" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "idNumber",
    r#"ALTER TABLE "Employee" ADD COLUMN "idNumber" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "dateOfBirth",
    r#"ALTER TABLE "Employee" ADD COLUMN "dateOfBirth" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "address",
    r#"ALTER TABLE "Employee" ADD COLUMN "address" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "startDate",
    r#"ALTER TABLE "Employee" ADD COLUMN "startDate" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "monthlySalary",
    r#"ALTER TABLE "Employee" ADD COLUMN "monthlySalary" TEXT;"#,
  )?;
  ensure_column(
    conn,
    "Employee",
    "salaryCurrencyCode",
    r#"ALTER TABLE "Employee" ADD COLUMN "salaryCurrencyCode" TEXT;"#,
  )?;

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use rusqlite::Connection;

  fn currency_table(conn: &Connection) {
    conn
      .execute_batch(
        r#"
        CREATE TABLE Currency (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          symbol TEXT,
          decimalPlaces INTEGER NOT NULL DEFAULT 2,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        "#,
      )
      .unwrap();
  }

  #[test]
  fn ensure_default_currencies_does_not_reactivate_deactivated() {
    let conn = Connection::open_in_memory().unwrap();
    currency_table(&conn);
    conn
      .execute(
        r#"INSERT INTO Currency
           (id, code, name, symbol, decimalPlaces, isActive, deletedAt, createdAt, updatedAt)
           VALUES ('usd1', 'USD', 'US Dollar', '$', 2, 0, NULL, '2026-01-01', '2026-01-01')"#,
        [],
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO Currency
           (id, code, name, symbol, decimalPlaces, isActive, deletedAt, createdAt, updatedAt)
           VALUES ('eur1', 'EUR', 'Euro', '€', 2, 0, NULL, '2026-01-01', '2026-01-01')"#,
        [],
      )
      .unwrap();

    ensure_default_currencies(&conn).unwrap();

    let usd_active: i64 = conn
      .query_row("SELECT isActive FROM Currency WHERE code='USD'", [], |r| {
        r.get(0)
      })
      .unwrap();
    let eur_active: i64 = conn
      .query_row("SELECT isActive FROM Currency WHERE code='EUR'", [], |r| {
        r.get(0)
      })
      .unwrap();
    assert_eq!(usd_active, 0, "USD must stay deactivated after migrate");
    assert_eq!(eur_active, 0, "EUR must stay deactivated after migrate");

    // Missing defaults are still seeded as active.
    let afn_active: i64 = conn
      .query_row("SELECT isActive FROM Currency WHERE code='AFN'", [], |r| {
        r.get(0)
      })
      .unwrap();
    assert_eq!(afn_active, 1);
  }
}

