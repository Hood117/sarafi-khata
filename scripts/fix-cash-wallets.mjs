import Database from "better-sqlite3";
import fs from "node:fs";

/**
 * One-PC Sarafi: keep only Main Vault as active shop cash (VAULT).
 * Soft-deactivates Cash Till and any extra VAULT/TILL wallets.
 * Does NOT delete wallets or ledger history.
 *
 * Prefer letting the Tauri app run `ensure_single_main_vault_cash` on startup
 * (it also transfers residual balances). Use this script only for ops repair.
 */
const dbPath = "C:/Users/Acc/AppData/Roaming/com.saraf.desktop/saraf.db";
const db = new Database(dbPath);
db.pragma("busy_timeout = 8000");

const ensureMain = db.prepare(
  `UPDATE Wallet SET isActive = 1, deletedAt = NULL, updatedAt = datetime('now')
   WHERE name = 'Main Vault' AND type = 'VAULT'`,
);
console.log("Main Vault activate:", ensureMain.run().changes);

const deactivateOthers = db.prepare(
  `UPDATE Wallet SET isActive = 0, updatedAt = datetime('now')
   WHERE type IN ('VAULT','TILL')
     AND deletedAt IS NULL
     AND NOT (name = 'Main Vault' AND type = 'VAULT')`,
);
console.log("deactivated other vault/till:", deactivateOthers.run().changes);

db.pragma("wal_checkpoint(TRUNCATE)");

const rows = db
  .prepare(
    `SELECT name, type, isActive, deletedAt
     FROM Wallet
     WHERE type IN ('VAULT','TILL')
     ORDER BY type, name`,
  )
  .all();
console.log("cash wallets now:", rows);

db.close();

for (const suffix of ["-wal", "-shm"]) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) {
    console.log("note: still present", p, fs.statSync(p).size, "bytes — restart the app");
  }
}
