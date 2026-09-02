/** Apply pending unified-account-number migration bits if the app hasn't stamped them yet. */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const migName = "20260810120000_unified_account_numbers.sql";
const migPath = path.join(__dirname, "..", "src-tauri", "migrations", migName);

const db = new Database(dbPath);
db.pragma("foreign_keys = OFF");

const stamped = db
  .prepare("SELECT 1 AS ok FROM saraf_migrations WHERE name = ?")
  .get(migName);

if (!stamped) {
  const sql = fs.readFileSync(migPath, "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO saraf_migrations (name) VALUES (?)").run(migName);
  console.log("Applied migration:", migName);
} else {
  console.log("Migration already stamped:", migName);
}

db.exec(`
  DROP INDEX IF EXISTS Customer_code_active_key;
  CREATE UNIQUE INDEX IF NOT EXISTS Customer_code_key
    ON Customer(code) WHERE code IS NOT NULL;
  CREATE TABLE IF NOT EXISTS AccountNumberSequence (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next INTEGER NOT NULL
  );
`);
db.prepare(
  `INSERT INTO AccountNumberSequence (id, next) VALUES (1, 2)
   ON CONFLICT(id) DO UPDATE SET next = excluded.next`,
).run();
// After wipe / repair, next should be 2 when no customers exist.
const custCount = db.prepare("SELECT COUNT(*) AS n FROM Customer").get().n;
if (custCount === 0) {
  db.prepare("UPDATE AccountNumberSequence SET next = 2 WHERE id = 1").run();
}
db.prepare(
  `UPDATE Wallet SET code = '1'
   WHERE name = 'Main Vault' AND type = 'VAULT' AND deletedAt IS NULL`,
).run();

console.log(
  "indexes",
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Customer_code%'",
    )
    .all(),
);
console.log(
  "main",
  db
    .prepare(
      "SELECT name, code FROM Wallet WHERE name='Main Vault' AND type='VAULT' AND deletedAt IS NULL",
    )
    .get(),
);
console.log(
  "sequence",
  db.prepare("SELECT * FROM AccountNumberSequence WHERE id=1").get(),
);
db.close();
console.log("Done.");
