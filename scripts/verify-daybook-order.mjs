/**
 * Verify Daybook journal ordering matches posting sequence (createdAt, id).
 * Read-only against the local desk DB — does not mutate data.
 */
import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.join(process.env.APPDATA || "", "com.saraf.desktop", "saraf.db");
const db = new Database(dbPath, { readonly: true });

const dayArg = process.argv[2];
const day =
  dayArg ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const byCreated = db
  .prepare(
    `SELECT reference, type, valueDate, createdAt, id,
            substr(COALESCE(description,''), 1, 70) AS descr
     FROM "Transaction"
     WHERE deletedAt IS NULL
       AND valueDate >= ? AND valueDate < date(?, '+1 day')
     ORDER BY createdAt ASC, id ASC`,
  )
  .all(day, day);

const byValueDate = db
  .prepare(
    `SELECT id FROM "Transaction"
     WHERE deletedAt IS NULL
       AND valueDate >= ? AND valueDate < date(?, '+1 day')
     ORDER BY valueDate ASC, createdAt ASC, id ASC`,
  )
  .all(day, day);

console.log(`business_date=${day} count=${byCreated.length}`);
byCreated.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(3)}  created=${r.createdAt}  valueDate=${r.valueDate}  ${r.type}  ${r.reference}  ${r.descr}`,
  );
});

let mismatch = 0;
for (let i = 0; i < byCreated.length; i++) {
  if (byCreated[i].id !== byValueDate[i]?.id) mismatch++;
}
console.log(
  mismatch === 0
    ? "OK: valueDate-first order matches createdAt order for this day"
    : `NOTE: valueDate-first would reorder ${mismatch}/${byCreated.length} rows vs posting order`,
);

// Simulate multi-tx identical createdAt: id must be deterministic secondary key
const dupTimes = db
  .prepare(
    `SELECT createdAt, COUNT(*) AS n
     FROM "Transaction"
     WHERE deletedAt IS NULL
       AND valueDate >= ? AND valueDate < date(?, '+1 day')
     GROUP BY createdAt
     HAVING n > 1`,
  )
  .all(day, day);
if (dupTimes.length) {
  console.log(`Identical createdAt groups: ${dupTimes.length} (secondary sort by id required)`);
} else {
  console.log("No identical createdAt collisions on this day");
}
