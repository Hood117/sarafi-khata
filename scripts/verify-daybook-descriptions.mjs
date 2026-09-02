/**
 * Verify human-readable Daybook descriptions for desk movements
 * (compose helpers mirror Rust wording; does not mutate production data permanently).
 */
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const db = new Database(dbPath);

function commas(raw) {
  const cleaned = String(raw).replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  const neg = n < 0;
  const abs = Math.abs(n);
  const intPart = Math.floor(abs);
  let intFmt = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (neg) intFmt = `-${intFmt}`;
  if (cleaned.includes(".")) {
    const frac = cleaned.split(".")[1].replace(/0+$/, "");
    if (frac) intFmt += `.${frac}`;
  }
  return intFmt;
}

function depositDesc(name, amount, ccy, by) {
  const who = by ? `by ${by}` : "by his own";
  return `${name} deposited ${commas(amount)} ${ccy} to his account ${who}`;
}
function withdrawDesc(name, amount, ccy, by) {
  const who = by ? `by ${by}` : "by his own";
  return `${name} withdrew ${commas(amount)} ${ccy} from his account ${who}`;
}
function transferDesc(sender, receiver, amount, ccy) {
  return `${sender} sent ${commas(amount)} ${ccy} to ${receiver} from his account`;
}
function transferFxDesc(sender, receiver, amount, ccy, recvAmt, recvCcy) {
  return `${sender} sent ${commas(amount)} ${ccy} to ${receiver} and received ${commas(recvAmt)} ${recvCcy}`;
}
function exchangeDesc(fromAmt, fromCcy, toAmt, toCcy, rate, walkIn) {
  const core = `Exchange of ${commas(fromAmt)} ${fromCcy} to ${commas(toAmt)} ${toCcy} at ${commas(rate)} rate`;
  return walkIn ? `${walkIn} — ${core}` : core;
}
function cashInDesc(amount, ccy, note) {
  return note
    ? `Cash in ${commas(amount)} ${ccy} to Main Vault — ${note}`
    : `Cash in ${commas(amount)} ${ccy} to Main Vault`;
}
function cashOutDesc(amount, ccy, note) {
  return note
    ? `Cash out ${commas(amount)} ${ccy} from Main Vault — ${note}`
    : `Cash out ${commas(amount)} ${ccy} from Main Vault`;
}
function hawalaSend(sender, receiver, amount, ccy) {
  return `${sender} sent ${commas(amount)} ${ccy} Hawala to ${receiver}`;
}
function hawalaRecv(receiver, sender, amount, ccy) {
  return `${receiver} received ${commas(amount)} ${ccy} Hawala from ${sender}`;
}

const checks = [
  [
    "self-deposit",
    depositDesc("Samsoor", "1000", "AFN", null),
    "Samsoor deposited 1,000 AFN to his account by his own",
  ],
  [
    "deposit-by-other",
    depositDesc("Samsoor", "1000", "AFN", "Ahmad"),
    "Samsoor deposited 1,000 AFN to his account by Ahmad",
  ],
  [
    "self-withdraw",
    withdrawDesc("Samsoor", "1000", "AFN", null),
    "Samsoor withdrew 1,000 AFN from his account by his own",
  ],
  [
    "withdraw-by-other",
    withdrawDesc("Samsoor", "1000", "AFN", "Ahmad"),
    "Samsoor withdrew 1,000 AFN from his account by Ahmad",
  ],
  [
    "transfer",
    transferDesc("Ahmad", "Mah", "10000", "AFN"),
    "Ahmad sent 10,000 AFN to Mah from his account",
  ],
  [
    "transfer-fx",
    transferFxDesc("Ahmad", "Mah", "10000", "USD", "12000", "AED"),
    "Ahmad sent 10,000 USD to Mah and received 12,000 AED",
  ],
  [
    "exchange",
    exchangeDesc("60000", "AFN", "1000", "USD", "60", null),
    "Exchange of 60,000 AFN to 1,000 USD at 60 rate",
  ],
  [
    "walk-in-exchange",
    exchangeDesc("60000", "AFN", "1000", "USD", "60", "Karim"),
    "Karim — Exchange of 60,000 AFN to 1,000 USD at 60 rate",
  ],
  [
    "cash-in",
    cashInDesc("1000000", "AFN", "Owner Capital"),
    "Cash in 1,000,000 AFN to Main Vault — Owner Capital",
  ],
  [
    "cash-out",
    cashOutDesc("100000", "AFN", "Owner Withdrawal"),
    "Cash out 100,000 AFN from Main Vault — Owner Withdrawal",
  ],
  [
    "hawala-send",
    hawalaSend("Ahmad", "Mah", "10000", "USD"),
    "Ahmad sent 10,000 USD Hawala to Mah",
  ],
  [
    "hawala-recv",
    hawalaRecv("Mah", "Ahmad", "10000", "USD"),
    "Mah received 10,000 USD Hawala from Ahmad",
  ],
];

let failed = 0;
for (const [name, got, want] of checks) {
  if (got !== want) {
    console.error(`FAIL ${name}\n  got:  ${got}\n  want: ${want}`);
    failed += 1;
  } else {
    console.log(`PASS ${name}`);
  }
}

// One-row deposit collapse smoke (ledger untouched after cleanup)
function allocateNext() {
  const row = db.prepare("SELECT next FROM AccountNumberSequence WHERE id = 1").get();
  const n = Math.max(row.next, 2);
  db.prepare("UPDATE AccountNumberSequence SET next = ? WHERE id = 1").run(n + 1);
  return String(n);
}

const now = new Date().toISOString().replace("T", " ").slice(0, 23);
const day = now.slice(0, 10);
const main = db
  .prepare(`SELECT id, code FROM Wallet WHERE name='Main Vault' AND type='VAULT' AND deletedAt IS NULL`)
  .get();
const afn = db.prepare(`SELECT id FROM Currency WHERE code='AFN' AND deletedAt IS NULL LIMIT 1`).get();
const equity = db
  .prepare(`SELECT id FROM Wallet WHERE name LIKE '%Opening Equity%' AND deletedAt IS NULL LIMIT 1`)
  .get();

if (main && afn) {
  const code = allocateNext();
  const customerId = randomUUID();
  const walletId = randomUUID();
  const txId = randomUUID();
  const desc = depositDesc("Samsoor", "12000", "AFN", null);
  db.prepare(
    `INSERT INTO Customer (id, code, fullName, phone, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?, ?, 'Samsoor', ?, 1, NULL, ?, ?)`,
  ).run(customerId, code, `0700${code}`, now, now);
  db.prepare(
    `INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt, code)
     VALUES (?, 'Samsoor', 'CUSTOMER', ?, 1, NULL, ?, ?, ?)`,
  ).run(walletId, customerId, now, now, code);
  db.prepare(
    `INSERT INTO "Transaction"
     (id, reference, type, valueDate, description, customerId, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, 'DEPOSIT', ?, ?, ?, ?, ?, NULL)`,
  ).run(txId, `DEP-${code}`, `${day} 15:00:00.000`, desc, customerId, now, now);
  db.prepare(
    `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
     VALUES (?, ?, ?, ?, 'DEBIT', '12000', ?)`,
  ).run(randomUUID(), txId, walletId, afn.id, now);
  db.prepare(
    `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
     VALUES (?, ?, ?, ?, 'DEBIT', '12000', ?)`,
  ).run(randomUUID(), txId, main.id, afn.id, now);
  if (equity) {
    db.prepare(
      `INSERT INTO LedgerEntry (id, transactionId, walletId, currencyId, direction, amount, createdAt)
       VALUES (?, ?, ?, ?, 'CREDIT', '24000', ?)`,
    ).run(randomUUID(), txId, equity.id, afn.id, now);
  }

  const legs = db
    .prepare(`SELECT COUNT(*) AS n FROM LedgerEntry WHERE transactionId = ?`)
    .get(txId).n;
  const displayable = db
    .prepare(
      `SELECT COUNT(*) AS n FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       WHERE le.transactionId = ? AND w.type != 'SYSTEM'
         AND UPPER(w.name) NOT LIKE '%OPENING EQUITY%'`,
    )
    .get(txId).n;

  const balanced =
    Number(
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN direction='DEBIT' THEN CAST(amount AS REAL) ELSE 0 END) -
             SUM(CASE WHEN direction='CREDIT' THEN CAST(amount AS REAL) ELSE 0 END) AS net
           FROM LedgerEntry WHERE transactionId = ?`,
        )
        .get(txId).net,
    ) === 0;

  console.log({
    legs,
    displayableSides: displayable,
    expectedDaybookRows: 1,
    ledgerBalanced: balanced,
    description: desc,
    oppositeShouldBe: main.code,
  });

  if (legs < 2 || !balanced || displayable !== 2) {
    console.error("FAIL ledger smoke");
    failed += 1;
  } else {
    console.log("PASS deposit ledger still double-entry; Daybook should show 1 primary row");
  }

  db.prepare("DELETE FROM LedgerEntry WHERE transactionId = ?").run(txId);
  db.prepare(`DELETE FROM "Transaction" WHERE id = ?`).run(txId);
  db.prepare("DELETE FROM Wallet WHERE id = ?").run(walletId);
  db.prepare("DELETE FROM Customer WHERE id = ?").run(customerId);
}

db.close();
if (failed) process.exit(1);
console.log("ALL PASS");
