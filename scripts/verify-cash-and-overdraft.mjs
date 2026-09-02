/**
 * Verify Main Vault Cash In/Out posting + customer overdraft path (SQL-level).
 * Does not start Tauri — posts the same legs the command uses.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const db = new Database(dbPath);

const now = new Date().toISOString().replace("T", " ").slice(0, 23);
const day = now.slice(0, 10);

function bal(walletId, currencyId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS b
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE le.walletId = ? AND le.currencyId = ?`,
    )
    .get(walletId, currencyId);
  return row?.b ?? 0;
}

const main = db
  .prepare(
    `SELECT id FROM Wallet WHERE name='Main Vault' AND type='VAULT' AND deletedAt IS NULL`,
  )
  .get();
let equity = db
  .prepare(
    `SELECT id FROM Wallet WHERE name='Opening Equity' AND type='SYSTEM' AND deletedAt IS NULL`,
  )
  .get();
if (!equity) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO Wallet (id, name, type, isActive, createdAt, updatedAt)
     VALUES (?, 'Opening Equity', 'SYSTEM', 1, ?, ?)`,
  ).run(id, now, now);
  equity = { id };
}
const usd = db.prepare(`SELECT id FROM Currency WHERE code='USD' AND deletedAt IS NULL`).get();
if (!main || !usd) {
  console.error("Missing Main Vault or USD");
  process.exit(1);
}

const before = bal(main.id, usd.id);

// Cash In 500
const txIn = randomUUID();
const refIn = `CASH-IN-TEST-${Date.now()}`;
db.prepare(
  `INSERT INTO "Transaction" (id, reference, type, valueDate, description, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, 'ADJUSTMENT', ?, 'Cash In test', ?, ?, NULL)`,
).run(txIn, refIn, `${day} 12:00:00.000`, now, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'DEBIT', '500', ?)`,
).run(randomUUID(), txIn, main.id, usd.id, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'CREDIT', '500', ?)`,
).run(randomUUID(), txIn, equity.id, usd.id, now);

const afterIn = bal(main.id, usd.id);
if (Math.abs(afterIn - (before + 500)) > 0.001) {
  console.error("FAIL cash in", { before, afterIn });
  process.exit(1);
}

// Cash Out 200
const txOut = randomUUID();
const refOut = `CASH-OUT-TEST-${Date.now()}`;
db.prepare(
  `INSERT INTO "Transaction" (id, reference, type, valueDate, description, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, 'ADJUSTMENT', ?, 'Cash Out test', ?, ?, NULL)`,
).run(txOut, refOut, `${day} 12:05:00.000`, now, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'CREDIT', '200', ?)`,
).run(randomUUID(), txOut, main.id, usd.id, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'DEBIT', '200', ?)`,
).run(randomUUID(), txOut, equity.id, usd.id, now);

const afterOut = bal(main.id, usd.id);
if (Math.abs(afterOut - (before + 300)) > 0.001) {
  console.error("FAIL cash out", { before, afterOut });
  process.exit(1);
}

// Customer overdraft: +2000 then withdraw 3000 → -1000
const seq = db.prepare("SELECT next FROM AccountNumberSequence WHERE id=1").get()?.next ?? 2;
db.prepare("UPDATE AccountNumberSequence SET next = ? WHERE id = 1").run(seq + 1);
const code = String(seq);
const custId = randomUUID();
const cwId = randomUUID();
db.prepare(
  `INSERT INTO Customer (id, code, fullName, phone, isActive, createdAt, updatedAt)
   VALUES (?, ?, 'Overdraft Test', ?, 1, ?, ?)`,
).run(custId, code, `0711${code}`, now, now);
db.prepare(
  `INSERT INTO Wallet (id, name, type, customerId, isActive, createdAt, updatedAt, code)
   VALUES (?, 'Overdraft Test Wallet', 'CUSTOMER', ?, 1, ?, ?, ?)`,
).run(cwId, custId, now, now, code);

const txDep = randomUUID();
db.prepare(
  `INSERT INTO "Transaction" (id, reference, type, valueDate, customerId, description, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, 'DEPOSIT', ?, ?, 'seed', ?, ?, NULL)`,
).run(txDep, `DEP-${code}`, `${day} 13:00:00.000`, custId, now, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'DEBIT', '2000', ?)`,
).run(randomUUID(), txDep, cwId, usd.id, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'CREDIT', '2000', ?)`,
).run(randomUUID(), txDep, main.id, usd.id, now);

const txWd = randomUUID();
db.prepare(
  `INSERT INTO "Transaction" (id, reference, type, valueDate, customerId, description, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, 'WITHDRAWAL', ?, ?, 'overdraft', ?, ?, NULL)`,
).run(txWd, `WD-${code}`, `${day} 13:10:00.000`, custId, now, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'CREDIT', '3000', ?)`,
).run(randomUUID(), txWd, cwId, usd.id, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
   VALUES (?, ?, ?, ?, 'DEBIT', '3000', ?)`,
).run(randomUUID(), txWd, main.id, usd.id, now);

const custBal = bal(cwId, usd.id);
if (Math.abs(custBal - -1000) > 0.001) {
  console.error("FAIL overdraft balance", custBal);
  process.exit(1);
}

// cleanup test rows
for (const tid of [txIn, txOut, txDep, txWd]) {
  db.prepare("DELETE FROM LedgerEntry WHERE transactionId = ?").run(tid);
  db.prepare(`DELETE FROM "Transaction" WHERE id = ?`).run(tid);
}
db.prepare("DELETE FROM Wallet WHERE id = ?").run(cwId);
db.prepare("DELETE FROM Customer WHERE id = ?").run(custId);
db.prepare("UPDATE AccountNumberSequence SET next = ? WHERE id = 1").run(seq);

console.log(
  JSON.stringify(
    {
      cashInOk: true,
      cashOutOk: true,
      overdraftBalance: -1000,
      mainVaultAfterCleanup: bal(main.id, usd.id),
      pass: true,
    },
    null,
    2,
  ),
);
db.close();
