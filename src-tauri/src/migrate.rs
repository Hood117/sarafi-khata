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
    match conn.execute_batch(&sql) {
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
        return Err(AppError::Db(format!("migration {name} failed: {e}")));
      }
    }
  }

  Ok(applied)
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
    "User",
    "allowedScreens",
    r#"ALTER TABLE "User" ADD COLUMN "allowedScreens" TEXT;"#,
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
  ensure_owner_capital_event_schema(conn)?;
  ensure_business_day_schema(conn)?;
  ensure_exchange_deal_schema(conn)?;
  ensure_vault_management_schema(conn)?;
  ensure_market_rate_cache_schema(conn)?;
  ensure_default_currencies(conn)?;
  Ok(())
}

/// Keep the shop catalog at the standard 20 currencies (insert missing / reactivate).
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
    let existing: Option<String> = conn
      .query_row(
        "SELECT id FROM Currency WHERE code = ?1 LIMIT 1",
        [code],
        |row| row.get(0),
      )
      .optional()
      .map_err(|e| AppError::Db(format!("currency lookup {code}: {e}")))?;

    if existing.is_some() {
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
    .map_err(|e| AppError::Db(format!("schema repair VaultReconciliation: {e}")))?;
    log::info!("schema repair: created vault reconciliation tables");
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
  if table_exists(conn, "BusinessDay")? {
    return Ok(());
  }
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
  .map_err(|e| AppError::Db(format!("schema repair BusinessDay: {e}")))?;
  log::info!("schema repair: created BusinessDay tables");
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
        WHERE trim("partnerSarafi") <> ''
      ) AS names
      WHERE NOT EXISTS (
        SELECT 1 FROM "PartnerSarafi" p
        WHERE p."name" = names."partnerSarafi" AND p."deletedAt" IS NULL
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
        "currencyId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "cashWalletId" TEXT NOT NULL,
        "transactionId" TEXT NOT NULL,
        "notes" TEXT,
        "valueDate" DATETIME NOT NULL,
        "createdById" TEXT NOT NULL,
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

  // Performance indexes for daybook / cash / hawala range filters (idempotent).
  conn
    .execute_batch(
      r#"
      CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_valueDate_idx"
        ON "Transaction"("deletedAt", "valueDate");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_walletId_currencyId_idx"
        ON "LedgerEntry"("walletId", "currencyId");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_deletedAt_valueDate_idx"
        ON "HawalaTransfer"("deletedAt", "valueDate");
      CREATE INDEX IF NOT EXISTS "HawalaTransfer_partnerSarafiId_status_idx"
        ON "HawalaTransfer"("partnerSarafiId", "status");
      CREATE INDEX IF NOT EXISTS "Wallet_type_deletedAt_idx"
        ON "Wallet"("type", "deletedAt");
      "#,
    )
    .map_err(|e| AppError::Db(format!("schema repair performance indexes: {e}")))?;

  Ok(())
}

