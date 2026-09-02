import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const db = new Database(dbPath);

function allocateNext() {
  const row = db.prepare("SELECT next FROM AccountNumberSequence WHERE id = 1").get();
  if (!row) throw new Error("AccountNumberSequence missing");
  const n = Math.max(row.next, 2);
  db.prepare("UPDATE AccountNumberSequence SET next = ? WHERE id = 1").run(n + 1);
  return String(n);
}

const main = db
  .prepare(
    `SELECT name, code FROM Wallet WHERE name='Main Vault' AND type='VAULT' AND deletedAt IS NULL`,
  )
  .get();
console.log("Main Vault:", main);
if (!main || String(main.code) !== "1") {
  console.error("FAIL: Main Vault is not #1");
  process.exit(1);
}

const indexes = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Customer_code%'`,
  )
  .all()
  .map((r) => r.name);
console.log("Customer code indexes:", indexes);

const now = new Date().toISOString().replace("T", " ").replace("Z", "");
const created = [];
for (const name of ["Test A", "Test B", "Test C"]) {
  const code = allocateNext();
  const id = randomUUID();
  const wid = randomUUID();
  db.prepare(
    `INSERT INTO Customer (id, code, fullName, phone, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 1, NULL, ?, ?)`,
  ).run(id, code, name, `07000000${code}`, now, now);
  db.prepare(
    `INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt, code)
     VALUES (?, ?, 'CUSTOMER', ?, NULL, 1, NULL, ?, ?, ?)`,
  ).run(wid, `${name} Wallet`, id, now, now, code);
  created.push({ name, code, id });
}

console.log("Created customers:", created);
const codes = created.map((c) => c.code);
if (codes.join(",") !== "2,3,4") {
  console.error("FAIL: expected codes 2,3,4 got", codes);
  process.exit(1);
}

const seq = db.prepare("SELECT next FROM AccountNumberSequence WHERE id = 1").get();
console.log("Sequence next (expect 5):", seq);

// Clean test customers so the desk starts empty for real UI tests
for (const c of created) {
  db.prepare("DELETE FROM Wallet WHERE customerId = ?").run(c.id);
  db.prepare("DELETE FROM Customer WHERE id = ?").run(c.id);
}
db.prepare("UPDATE AccountNumberSequence SET next = 2 WHERE id = 1").run();
console.log("Cleaned test customers; sequence reset to 2.");
console.log("PASS");
db.close();
