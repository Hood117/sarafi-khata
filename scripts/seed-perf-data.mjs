/**
 * Bulk performance seed for Sarafi (SQLite).
 *
 * Generates 100,000+ rows (customers, wallets, transactions, ledger entries)
 * for UI performance / accessibility / search / pagination testing.
 *
 * Does NOT change schema, balance formulas, or Tauri financial commands.
 * Postings are balanced DEPOSIT legs (customer debit + Main Vault credit).
 *
 * Usage (close the desktop app first if targeting its DB):
 *   npm run db:seed:perf
 *   npm run db:seed:perf -- --db "C:\\Users\\You\\AppData\\Roaming\\com.saraf.desktop\\saraf.db"
 *   npm run db:seed:perf -- --customers 50000 --transactions 60000
 *
 * Env overrides:
 *   SARAF_DB / DATABASE_URL
 *   PERF_CUSTOMERS (default 40000)
 *   PERF_TRANSACTIONS (default 35000)
 *   PERF_BATCH (default 1000)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseCount(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveDbPath() {
  const fromArg = argValue("--db");
  if (fromArg) return path.resolve(fromArg);

  if (process.env.SARAF_DB?.trim()) return path.resolve(process.env.SARAF_DB.trim());

  const url = process.env.DATABASE_URL?.trim();
  if (url?.startsWith("file:")) {
    const file = url.slice("file:".length);
    return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
  }

  const candidates = [
    path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db"),
    path.join(process.env.LOCALAPPDATA || "", "com.saraf.desktop", "saraf.db"),
    path.join(os.homedir(), "AppData", "Roaming", "com.saraf.desktop", "saraf.db"),
    path.join(ROOT, "prisma", "dev.db"),
    path.join(ROOT, "prisma", "perf.db"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return path.join(ROOT, "prisma", "perf.db");
}

function nowSqlite(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

const FIRST = [
  "Ahmad", "Omar", "Karim", "Farid", "Jamal", "Navid", "Sami", "Bilal", "Hassan", "Yusuf",
  "Zahra", "Laila", "Mariam", "Sara", "Nadia", "Fatima", "Amina", "Hania", "Roya", "Parisa",
];
const LAST = [
  "Ahmadi", "Rahimi", "Karimi", "Hosseini", "Noori", "Sadat", "Wahidi", "Popalzai", "Barakzai",
  "Mohammadi", "Nazari", "Qaderi", "Hakimi", "Safi", "Stanikzai", "Gul", "Shinwari", "Yusufzai",
];

function customerName(i) {
  return `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${pad(i, 5)}`;
}

function ensurePrerequisites(db) {
  const admin = db
    .prepare(`SELECT id FROM User WHERE role = 'ADMIN' AND isActive = 1 ORDER BY createdAt LIMIT 1`)
    .get();
  if (!admin) {
    throw new Error(
      "No active ADMIN user found. Run the normal seed / open the app once before perf seeding.",
    );
  }

  const vault = db
    .prepare(
      `SELECT id FROM Wallet
       WHERE type = 'VAULT' AND name = 'Main Vault' AND deletedAt IS NULL
       ORDER BY createdAt LIMIT 1`,
    )
    .get();
  if (!vault) {
    throw new Error("Main Vault wallet missing. Run prisma seed / open the app once first.");
  }

  const equity = db
    .prepare(
      `SELECT id FROM Wallet
       WHERE type = 'SYSTEM' AND name = 'Opening Equity' AND deletedAt IS NULL
       ORDER BY createdAt LIMIT 1`,
    )
    .get();
  if (!equity) {
    throw new Error("Opening Equity wallet missing. Run prisma seed / open the app once first.");
  }

  const currencies = db
    .prepare(
      `SELECT id, code, decimalPlaces FROM Currency
       WHERE deletedAt IS NULL AND isActive = 1
       ORDER BY code`,
    )
    .all();
  if (currencies.length === 0) {
    throw new Error("No currencies found. Seed currencies first.");
  }

  const preferred = ["AFN", "USD", "EUR", "PKR", "AED"];
  const ordered = [
    ...preferred
      .map((code) => currencies.find((c) => c.code === code))
      .filter(Boolean),
    ...currencies.filter((c) => !preferred.includes(c.code)),
  ];

  return {
    adminId: admin.id,
    vaultId: vault.id,
    equityId: equity.id,
    currencies: ordered,
  };
}

function countTable(db, table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
}

function printStats(db, label) {
  console.log(`\n${label}`);
  for (const table of ["Customer", "Wallet", "Transaction", "LedgerEntry"]) {
    console.log(`  ${table}: ${countTable(db, table).toLocaleString()}`);
  }
}

function main() {
  const customersTarget = parseCount(
    argValue("--customers") ?? process.env.PERF_CUSTOMERS,
    40_000,
  );
  const txTarget = parseCount(
    argValue("--transactions") ?? process.env.PERF_TRANSACTIONS,
    35_000,
  );
  const batch = Math.max(
    100,
    parseCount(argValue("--batch") ?? process.env.PERF_BATCH, 1_000),
  );
  const dryRun = hasFlag("--dry-run");

  const dbPath = resolveDbPath();
  const parent = path.dirname(dbPath);
  fs.mkdirSync(parent, { recursive: true });

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Database not found: ${dbPath}\n` +
        `Open the desktop app once (or copy an existing saraf.db), then re-run.\n` +
        `Or pass --db <path-to-saraf.db>`,
    );
  }

  console.log("Sarafi performance seed");
  console.log(`  DB: ${dbPath}`);
  console.log(`  Customers to add: ${customersTarget.toLocaleString()}`);
  console.log(`  Deposit txs to add: ${txTarget.toLocaleString()}`);
  console.log(
    `  Approx new rows: ${(
      customersTarget +
      customersTarget +
      txTarget +
      txTarget * 3
    ).toLocaleString()} (customers + wallets + txs + ledger lines)`,
  );
  if (dryRun) {
    console.log("  Dry run only — no writes.");
    return;
  }

  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    throw new Error(
      `Could not open DB (is the desktop app still running?):\n${err instanceof Error ? err.message : err}`,
    );
  }

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("foreign_keys = ON");

  printStats(db, "Before");
  const { adminId, vaultId, equityId, currencies } = ensurePrerequisites(db);

  const insertCustomer = db.prepare(`
    INSERT INTO Customer (
      id, code, fullName, fatherName, phone, address, nationalId, notes,
      isActive, deletedAt, createdAt, updatedAt
    ) VALUES (
      @id, @code, @fullName, @fatherName, @phone, @address, NULL, @notes,
      1, NULL, @createdAt, @updatedAt
    )
  `);

  const insertWallet = db.prepare(`
    INSERT INTO Wallet (
      id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt
    ) VALUES (
      @id, @name, 'CUSTOMER', @customerId, NULL, 1, NULL, @createdAt, @updatedAt
    )
  `);

  const insertTx = db.prepare(`
    INSERT INTO "Transaction" (
      id, reference, type, status, customerId, walkInName, walkInPhone,
      description, valueDate, postedAt, createdById, deletedAt, createdAt, updatedAt
    ) VALUES (
      @id, @reference, 'DEPOSIT', 'POSTED', @customerId, NULL, NULL,
      @description, @valueDate, @postedAt, @createdById, NULL, @createdAt, @updatedAt
    )
  `);

  const insertLedger = db.prepare(`
    INSERT INTO LedgerEntry (
      id, transactionId, walletId, currencyId, direction, amount,
      exchangeRateId, memo, createdAt
    ) VALUES (
      @id, @transactionId, @walletId, @currencyId, @direction, @amount,
      NULL, @memo, @createdAt
    )
  `);

  const customerIds = [];
  const walletByCustomer = new Map();

  const t0 = Date.now();

  // --- Customers + wallets ---
  console.log("\nInserting customers + wallets…");
  for (let start = 0; start < customersTarget; start += batch) {
    const end = Math.min(start + batch, customersTarget);
    const insertBatch = db.transaction(() => {
      for (let i = start; i < end; i++) {
        const id = randomUUID();
        const walletId = randomUUID();
        const stamp = nowSqlite(-(customersTarget - i) * 60_000);
        const name = customerName(i);
        insertCustomer.run({
          id,
          code: `PERF-C-${pad(i + 1, 6)}`,
          fullName: name,
          fatherName: LAST[(i + 3) % LAST.length],
          phone: `07${pad(1_000_000 + i, 8)}`,
          address: `Kabul — Block ${1 + (i % 40)}`,
          notes: i % 17 === 0 ? "perf-seed note" : null,
          createdAt: stamp,
          updatedAt: stamp,
        });
        insertWallet.run({
          id: walletId,
          name: `${name} Wallet`,
          customerId: id,
          createdAt: stamp,
          updatedAt: stamp,
        });
        customerIds.push(id);
        walletByCustomer.set(id, walletId);
      }
    });
    insertBatch();
    if (end === customersTarget || end % (batch * 5) === 0 || end === batch) {
      console.log(`  customers ${end.toLocaleString()} / ${customersTarget.toLocaleString()}`);
    }
  }

  if (customerIds.length === 0) {
    // Allow transaction-only runs against existing customers.
    const existing = db
      .prepare(
        `SELECT c.id AS id, w.id AS walletId
         FROM Customer c
         JOIN Wallet w ON w.customerId = c.id AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
         WHERE c.deletedAt IS NULL
         LIMIT 50000`,
      )
      .all();
    for (const row of existing) {
      customerIds.push(row.id);
      walletByCustomer.set(row.id, row.walletId);
    }
    if (customerIds.length === 0) {
      throw new Error("No customers available for transaction seeding.");
    }
    console.log(`Using ${customerIds.length.toLocaleString()} existing customers for txs.`);
  }

  // --- Balanced deposits (same shape as post_customer_give) ---
  console.log("\nInserting deposit transactions + ledger entries…");
  const amounts = ["50.00", "100.00", "250.00", "500.00", "1000.00", "2500.00", "5000.00"];

  for (let start = 0; start < txTarget; start += batch) {
    const end = Math.min(start + batch, txTarget);
    const insertBatch = db.transaction(() => {
      for (let i = start; i < end; i++) {
        const customerId = customerIds[i % customerIds.length];
        const customerWalletId = walletByCustomer.get(customerId);
        if (!customerWalletId) continue;

        const currency = currencies[i % currencies.length];
        const amount = amounts[i % amounts.length];
        const equityAmount = (Number.parseFloat(amount) * 2).toFixed(2);
        const txId = randomUUID();
        const stamp = nowSqlite(-(txTarget - i) * 45_000);

        insertTx.run({
          id: txId,
          reference: `PERF-DEP-${pad(i + 1, 8)}`,
          customerId,
          description: `Perf seed deposit ${currency.code} ${amount}`,
          valueDate: stamp,
          postedAt: stamp,
          createdById: adminId,
          createdAt: stamp,
          updatedAt: stamp,
        });

        // Customer ↑ DEBIT
        insertLedger.run({
          id: randomUUID(),
          transactionId: txId,
          walletId: customerWalletId,
          currencyId: currency.id,
          direction: "DEBIT",
          amount,
          memo: "Customer deposit",
          createdAt: stamp,
        });
        // Main Vault cash in ↑ DEBIT
        insertLedger.run({
          id: randomUUID(),
          transactionId: txId,
          walletId: vaultId,
          currencyId: currency.id,
          direction: "DEBIT",
          amount,
          memo: "Main Vault — cash in",
          createdAt: stamp,
        });
        // Opening Equity balancing CREDIT (2×)
        insertLedger.run({
          id: randomUUID(),
          transactionId: txId,
          walletId: equityId,
          currencyId: currency.id,
          direction: "CREDIT",
          amount: equityAmount,
          memo: "Balancing equity leg",
          createdAt: stamp,
        });
      }
    });
    insertBatch();
    if (end === txTarget || end % (batch * 5) === 0 || end === batch) {
      console.log(`  transactions ${end.toLocaleString()} / ${txTarget.toLocaleString()}`);
    }
  }

  db.close();
  const after = new Database(dbPath, { readonly: true });
  printStats(after, `After (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  after.close();

  console.log("\nDone.");
  console.log("Tips:");
  console.log("  • Close/reopen the desktop app (or restart npm run dev) to pick up the data.");
  console.log("  • Customers use codes PERF-C-###### and phones 07######## for search tests.");
  console.log("  • Transactions use references PERF-DEP-########.");
  console.log("  • Soft-delete / daybook / debtors screens will stress pagination and filters.");
}

try {
  main();
} catch (err) {
  console.error("\nPerf seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
