-- Owner capital events (investments / withdrawals / adjustments).
-- Calculated capital always comes from ledger; this table is the audit trail for owner ops.

CREATE TABLE IF NOT EXISTS "OwnerCapitalEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "currencyId" TEXT NOT NULL,
  "amount" DECIMAL NOT NULL,
  "cashWalletId" TEXT,
  "transactionId" TEXT,
  "notes" TEXT,
  "reason" TEXT,
  "createdById" TEXT,
  "valueDate" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OwnerCapitalEvent_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OwnerCapitalEvent_cashWalletId_fkey"
    FOREIGN KEY ("cashWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OwnerCapitalEvent_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OwnerCapitalEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_valueDate_idx"
  ON "OwnerCapitalEvent"("valueDate");
CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_kind_valueDate_idx"
  ON "OwnerCapitalEvent"("kind", "valueDate");
CREATE INDEX IF NOT EXISTS "OwnerCapitalEvent_currencyId_idx"
  ON "OwnerCapitalEvent"("currencyId");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerCapitalEvent_transactionId_key"
  ON "OwnerCapitalEvent"("transactionId");
