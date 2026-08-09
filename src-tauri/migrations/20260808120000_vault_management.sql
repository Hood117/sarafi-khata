-- Vault Management: metadata on Wallet + denominations + per-vault reconciliation.
-- Monetary truth remains LedgerEntry on VAULT/TILL wallets.

ALTER TABLE "Wallet" ADD COLUMN "code" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "location" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "description" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "notes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_code_key"
  ON "Wallet"("code") WHERE "code" IS NOT NULL AND "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "CurrencyDenomination" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "currencyId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" DECIMAL NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CurrencyDenomination_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CurrencyDenomination_currencyId_sortOrder_idx"
  ON "CurrencyDenomination"("currencyId", "sortOrder");

CREATE TABLE IF NOT EXISTS "VaultReconciliation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL,
  "businessDayId" TEXT,
  "businessDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "differenceReason" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "confirmedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VaultReconciliation_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VaultReconciliation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "VaultReconciliation_walletId_businessDate_idx"
  ON "VaultReconciliation"("walletId", "businessDate");
CREATE INDEX IF NOT EXISTS "VaultReconciliation_businessDate_idx"
  ON "VaultReconciliation"("businessDate");

CREATE TABLE IF NOT EXISTS "VaultReconciliationLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reconciliationId" TEXT NOT NULL,
  "currencyId" TEXT NOT NULL,
  "expectedAmount" DECIMAL NOT NULL DEFAULT 0,
  "physicalAmount" DECIMAL NOT NULL DEFAULT 0,
  "difference" DECIMAL NOT NULL DEFAULT 0,
  "denominationJson" TEXT,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VaultReconciliationLine_reconciliationId_fkey"
    FOREIGN KEY ("reconciliationId") REFERENCES "VaultReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VaultReconciliationLine_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "VaultReconciliationLine_recon_currency_key"
  ON "VaultReconciliationLine"("reconciliationId", "currencyId");
