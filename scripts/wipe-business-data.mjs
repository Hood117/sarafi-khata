/**
 * Clean-slate wipe for Saraf desktop DB.
 * Keeps: admin user, Currency(+denoms), SystemSetting, Main Vault + SYSTEM wallets,
 *         AccountNumberSequence (reset so next customer = #2), schema/migrations.
 * Deletes: customers, CUSTOMER/PARTNER wallets, WalletCurrencyBalance cache,
 *          all ledger/tx/business data, employees, non-admin users.
 *          Does NOT delete migration files or destroy financial architecture.
 *
 * After wipe: Main Vault account number = #1; next allocated number = #2.
 *
 * Usage: node scripts/wipe-business-data.mjs [path-to-saraf.db]
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB = path.join(
  process.env.APPDATA || "",
  "com.saraf.desktop",
  "saraf.db",
);

const dbPath = process.argv[2] || DEFAULT_DB;
if (!fs.existsSync(dbPath)) {
  console.error("DB not found:", dbPath);
  process.exit(1);
}

console.log("Wiping business data in:", dbPath);

const db = new Database(dbPath);
db.pragma("foreign_keys = OFF");
db.pragma("busy_timeout = 8000");

const tables = new Set(
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name),
);

function count(sql) {
  try {
    return db.prepare(sql).get()?.n ?? 0;
  } catch {
    return -1;
  }
}

function runDelete(sql) {
  const match = sql.match(/FROM\s+"?([A-Za-z0-9_]+)"?/i);
  const table = match?.[1];
  if (table && !tables.has(table)) {
    console.log(`skip (missing): ${table}`);
    return;
  }
  const info = db.prepare(sql).run();
  console.log(`${sql} → ${info.changes}`);
}

function runSql(sql, params = []) {
  try {
    const info = db.prepare(sql).run(...params);
    console.log(`${sql} → ${info.changes}`);
  } catch (err) {
    console.log(`skip/fail: ${sql} (${err.message})`);
  }
}

console.log("Before:", {
  customers: count("SELECT COUNT(*) AS n FROM Customer"),
  transactions: count('SELECT COUNT(*) AS n FROM "Transaction"'),
  ledger: count("SELECT COUNT(*) AS n FROM LedgerEntry"),
  wallets: count("SELECT COUNT(*) AS n FROM Wallet"),
  users: count("SELECT COUNT(*) AS n FROM User"),
  currencies: count("SELECT COUNT(*) AS n FROM Currency"),
  employees: tables.has("Employee")
    ? count("SELECT COUNT(*) AS n FROM Employee")
    : 0,
});

const wipeStatements = [
  "DELETE FROM LedgerEntry",
  'DELETE FROM "Transaction"',
  "DELETE FROM ExchangeDeal",
  "DELETE FROM ExchangeRate",
  "DELETE FROM OwnerCapitalEvent",
  "DELETE FROM BusinessDayCashCount",
  "DELETE FROM BusinessDay",
  "DELETE FROM VaultReconciliationLine",
  "DELETE FROM VaultReconciliation",
  "DELETE FROM MarketRateCache",
  "DELETE FROM PartnerCommissionSettlement",
  "DELETE FROM HawalaAttachment",
  "DELETE FROM HawalaEvent",
  "DELETE FROM HawalaTransfer",
  "DELETE FROM PartnerSarafi",
  "DELETE FROM TradingTrade",
  "DELETE FROM TradingInventory",
  "DELETE FROM TradingMarketRate",
  "DELETE FROM EmployeeSalaryPayment",
  "DELETE FROM Employee",
  // Balance cache must go with the ledger or UI can show stale vault/customer cash.
  "DELETE FROM WalletCurrencyBalance",
  "DELETE FROM Wallet WHERE type = 'CUSTOMER' OR customerId IS NOT NULL",
  "DELETE FROM Wallet WHERE type = 'PARTNER'",
  "DELETE FROM Wallet WHERE type IN ('VAULT','TILL') AND name NOT IN ('Main Vault', 'Cash Till')",
  // Bank wallets are shop bank accounts created during testing — not system accounts.
  "DELETE FROM Wallet WHERE type = 'BANK'",
  "DELETE FROM Customer",
  "DELETE FROM Session",
  "DELETE FROM AuditLog",
  "DELETE FROM User WHERE lower(username) != 'admin'",
];

const tx = db.transaction(() => {
  for (const sql of wipeStatements) runDelete(sql);

  // Ensure sequence table exists and reset allocator (Main Vault = #1, next = #2).
  runSql(`
    CREATE TABLE IF NOT EXISTS AccountNumberSequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next INTEGER NOT NULL
    )
  `);
  runSql(
    `INSERT INTO AccountNumberSequence (id, next) VALUES (1, 2)
     ON CONFLICT(id) DO UPDATE SET next = 2`,
  );
  runSql(
    `UPDATE Wallet SET code = '1'
     WHERE name = 'Main Vault' AND type = 'VAULT' AND deletedAt IS NULL`,
  );
});

try {
  tx();
} catch (err) {
  console.error("Wipe failed:", err);
  process.exit(1);
}

db.pragma("foreign_keys = ON");
db.pragma("wal_checkpoint(TRUNCATE)");

const mainVault = db
  .prepare(
    `SELECT name, code, type, isActive FROM Wallet
     WHERE name = 'Main Vault' AND type = 'VAULT' AND deletedAt IS NULL
     LIMIT 1`,
  )
  .get();

let sequence = null;
try {
  sequence = db.prepare("SELECT id, next FROM AccountNumberSequence WHERE id = 1").get();
} catch {
  sequence = null;
}

console.log(
  "After:",
  JSON.stringify(
    {
      customers: count("SELECT COUNT(*) AS n FROM Customer"),
      transactions: count('SELECT COUNT(*) AS n FROM "Transaction"'),
      ledger: count("SELECT COUNT(*) AS n FROM LedgerEntry"),
      employees: tables.has("Employee")
        ? count("SELECT COUNT(*) AS n FROM Employee")
        : 0,
      wallets: db.prepare("SELECT type, name, code FROM Wallet ORDER BY type, name").all(),
      mainVault,
      accountNumberSequence: sequence,
      users: db.prepare("SELECT username, role FROM User").all(),
      currencies: count("SELECT COUNT(*) AS n FROM Currency"),
      trades: tables.has("TradingTrade")
        ? count("SELECT COUNT(*) AS n FROM TradingTrade")
        : 0,
      hawala: tables.has("HawalaTransfer")
        ? count("SELECT COUNT(*) AS n FROM HawalaTransfer")
        : 0,
    },
    null,
    2,
  ),
);

if (!mainVault || String(mainVault.code) !== "1") {
  console.warn("WARNING: Main Vault account number is not #1 after wipe.");
}

db.close();
console.log("Done. Restart the Saraf app to reload.");
