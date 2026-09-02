-- Permanent human-friendly transaction numbers (DEP-0001, …).
-- Does not modify Transaction.reference. Sequence never resets or reuses.

CREATE TABLE IF NOT EXISTS "TransactionDisplaySequence" (
  "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
  "next" INTEGER NOT NULL
);

ALTER TABLE "Transaction" ADD COLUMN "displaySeq" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "displayRef" TEXT;

-- Backfill in chronological order. Prefix is applied in Rust repair as well;
-- this SQL assigns the integer sequence so existing rows are unique immediately.
WITH ordered AS (
  SELECT id AS tid, ROW_NUMBER() OVER (ORDER BY datetime(createdAt) ASC, createdAt ASC, id ASC) AS seq
  FROM "Transaction"
  WHERE "displaySeq" IS NULL
)
UPDATE "Transaction"
SET "displaySeq" = (
  SELECT seq FROM ordered WHERE ordered.tid = "Transaction".id
)
WHERE "displaySeq" IS NULL;

INSERT OR IGNORE INTO "TransactionDisplaySequence" ("id", "next")
SELECT 1, COALESCE((SELECT MAX("displaySeq") FROM "Transaction"), 0) + 1;

UPDATE "TransactionDisplaySequence"
SET "next" = (
  SELECT MAX(n) FROM (
    SELECT COALESCE(MAX("displaySeq"), 0) + 1 AS n FROM "Transaction"
    UNION ALL
    SELECT "next" FROM "TransactionDisplaySequence" WHERE id = 1
  )
)
WHERE id = 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_displaySeq_key"
  ON "Transaction"("displaySeq") WHERE "displaySeq" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_displayRef_key"
  ON "Transaction"("displayRef") WHERE "displayRef" IS NOT NULL;
