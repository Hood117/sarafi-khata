-- Unified account numbers (ADR-045):
-- Main Vault = 1; customers allocate 2, 3, 4… Never reuse. Not user-editable.

CREATE TABLE IF NOT EXISTS "AccountNumberSequence" (
  "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
  "next" INTEGER NOT NULL
);

INSERT OR IGNORE INTO "AccountNumberSequence" ("id", "next") VALUES (1, 2);

-- Global uniqueness for customer account numbers (incl. archived) — never reuse.
DROP INDEX IF EXISTS "Customer_code_active_key";
DROP INDEX IF EXISTS "Customer_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_code_key"
  ON "Customer"("code") WHERE "code" IS NOT NULL;

-- Reserve Main Vault as account #1 when present.
UPDATE "Wallet"
SET "code" = '1',
    "updatedAt" = datetime('now')
WHERE "name" = 'Main Vault'
  AND "type" = 'VAULT'
  AND "deletedAt" IS NULL
  AND ("code" IS NULL OR TRIM("code") = '' OR "code" != '1');
