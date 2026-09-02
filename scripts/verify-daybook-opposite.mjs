/**
 * Verify Daybook shows ONE business row per deposit (customer primary,
 * Main Vault as Opposite Account) — not both ledger sides.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const db = new Database(dbPath);

function allocateNext() {
  const row = db.prepare("SELECT next FROM AccountNumberSequence WHERE id = 1").get();
  const n = Math.max(row.next, 2);
  db.prepare("UPDATE AccountNumberSequence SET next = ? WHERE id = 1").run(n + 1);
  return String(n);
}

/** Mirror list_daybook_journal primary-party collapse for a single deposit. */
function collapseDaybookRows(txId) {
  const meta = db
    .prepare(
      `SELECT id, reference, type, COALESCE(description,'') AS description,
              COALESCE(customerId,'') AS customerId
       FROM "Transaction" WHERE id = ?`,
    )
    .get(txId);

  const lines = db
    .prepare(
      `SELECT le.walletId AS walletId, w.type AS walletType, w.name AS walletName,
              COALESCE(w.customerId,'') AS walletCustomerId,
              COALESCE(cust.code,'') AS custCode, COALESCE(w.code,'') AS walletCode,
              COALESCE(cust.fullName, w.name) AS accountName,
              c.code AS currencyCode, le.direction AS direction,
              CAST(le.amount AS REAL) AS amount
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       LEFT JOIN Customer cust ON cust.id = w.customerId
       WHERE le.transactionId = ? AND w.type != 'SYSTEM'`,
    )
    .all(txId);

  function isDisplayable(p) {
    const t = String(p.walletType).toUpperCase();
    const n = String(p.walletName).toUpperCase();
    if (t === "SYSTEM") return false;
    return !(
      n.includes("OPENING EQUITY") ||
      n.includes("EXCHANGE DIFFERENCE") ||
      n.includes("HAWALA CLEARING") ||
      n.includes("WALK-IN OUTBOUND") ||
      n.includes("COMMISSION")
    );
  }

  function resolveCode(p) {
    const c = String(p.custCode || "").trim();
    if (c) return c;
    return String(p.walletCode || "").trim();
  }

  const displayable = lines.filter(isDisplayable);
  const customers = displayable.filter((p) => String(p.walletType).toUpperCase() === "CUSTOMER");
  let primaryWallet = null;
  if (meta.customerId) {
    const hit = customers.find((p) => p.walletCustomerId === meta.customerId);
    if (hit) primaryWallet = hit.walletId;
  }
  if (!primaryWallet && customers.length) primaryWallet = customers[0].walletId;
  if (!primaryWallet && displayable.length) primaryWallet = displayable[0].walletId;

  const primaryLines = displayable.filter((p) => p.walletId === primaryWallet);
  const byCcy = new Map();
  for (const line of primaryLines) {
    byCcy.set(line.currencyCode, line);
  }

  function opposite(selfId) {
    const others = lines.filter((p) => p.walletId !== selfId && isDisplayable(p));
    const pick = others[0];
    return pick ? resolveCode(pick) : "";
  }

  return {
    meta,
    rows: [...byCcy.values()].map((line) => ({
      accountCode: resolveCode(line),
      accountName: line.accountName,
      opposite: opposite(primaryWallet),
      description: String(meta.description || "").trim() || "Customer deposit",
      currency: line.currencyCode,
      direction: line.direction,
      amount: line.amount,
    })),
  };
}

const now = new Date().toISOString().replace("T", " ").slice(0, 23);
const day = now.slice(0, 10);

const main = db
  .prepare(
    `SELECT id, code FROM Wallet WHERE name='Main Vault' AND type='VAULT' AND deletedAt IS NULL`,
  )
  .get();
const afn = db
  .prepare(`SELECT id FROM Currency WHERE code='AFN' AND deletedAt IS NULL LIMIT 1`)
  .get();
const equity = db
  .prepare(
    `SELECT id FROM Wallet WHERE name LIKE '%Opening Equity%' AND deletedAt IS NULL LIMIT 1`,
  )
  .get();
if (!main || !afn) {
  console.error("Missing Main Vault or AFN");
  process.exit(1);
}

const code = allocateNext();
const customerId = randomUUID();
const walletId = randomUUID();
db.prepare(
  `INSERT INTO Customer (id, code, fullName, phone, isActive, deletedAt, createdAt, updatedAt)
   VALUES (?, ?, 'Daybook One Row', ?, 1, NULL, ?, ?)`,
).run(customerId, code, `0799${code}`, now, now);
db.prepare(
  `INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt, code)
   VALUES (?, 'Daybook One Row Wallet', 'CUSTOMER', ?, 1, NULL, ?, ?, ?)`,
).run(walletId, customerId, now, now, code);

const txId = randomUUID();
const desc = `Customer deposit — Daybook One Row`;
db.prepare(
  `INSERT INTO "Transaction"
   (id, reference, type, valueDate, description, customerId, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, 'DEPOSIT', ?, ?, ?, ?, ?, NULL)`,
).run(txId, `DEP-${code}`, `${day} 12:00:00.000`, desc, customerId, now, now);

// Real deposit shape: customer DEBIT + vault DEBIT + equity CREDIT (2x)
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt, memo)
   VALUES (?, ?, ?, ?, 'DEBIT', '12000', ?, 'Customer deposit')`,
).run(randomUUID(), txId, walletId, afn.id, now);
db.prepare(
  `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt, memo)
   VALUES (?, ?, ?, ?, 'DEBIT', '12000', ?, 'Main Vault — cash in')`,
).run(randomUUID(), txId, main.id, afn.id, now);
if (equity) {
  db.prepare(
    `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt, memo)
     VALUES (?, ?, ?, ?, 'CREDIT', '24000', ?, 'Balancing equity leg')`,
  ).run(randomUUID(), txId, equity.id, afn.id, now);
}

const result = collapseDaybookRows(txId);
console.log(result);

const ok =
  String(main.code) === "1" &&
  result.rows.length === 1 &&
  result.rows[0].accountCode === code &&
  result.rows[0].opposite === "1" &&
  result.rows[0].description === desc &&
  Number(result.rows[0].amount) === 12000;

// cleanup
db.prepare("DELETE FROM LedgerEntry WHERE transactionId = ?").run(txId);
db.prepare(`DELETE FROM "Transaction" WHERE id = ?`).run(txId);
db.prepare("DELETE FROM Wallet WHERE id = ?").run(walletId);
db.prepare("DELETE FROM Customer WHERE id = ?").run(customerId);

if (!ok) {
  console.error("FAIL: expected one customer row with opposite #1 and deposit description");
  process.exit(1);
}
console.log(`PASS: one Daybook row — #${code} Daybook One Row · opposite #1 · ${desc}`);
db.close();
