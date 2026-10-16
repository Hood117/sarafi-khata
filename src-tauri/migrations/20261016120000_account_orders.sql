-- Account Orders: document/tracking for bulk remittance distribution.
-- Does NOT post to the ledger or change customer balances.

CREATE TABLE IF NOT EXISTS "AccountOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderNumber" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "customerId" TEXT,
  "currencyId" TEXT NOT NULL,
  "orderDate" DATETIME NOT NULL,
  "originalAmount" DECIMAL NOT NULL,
  "purchaseDeductionPercent" DECIMAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdById" TEXT,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AccountOrder_orderNumber_key" UNIQUE ("orderNumber"),
  CONSTRAINT "AccountOrder_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountOrder_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountOrder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AccountOrder_deletedAt_orderDate_idx"
  ON "AccountOrder"("deletedAt", "orderDate");
CREATE INDEX IF NOT EXISTS "AccountOrder_deletedAt_status_orderDate_idx"
  ON "AccountOrder"("deletedAt", "status", "orderDate");
CREATE INDEX IF NOT EXISTS "AccountOrder_customerId_idx"
  ON "AccountOrder"("customerId");
CREATE INDEX IF NOT EXISTS "AccountOrder_currencyId_idx"
  ON "AccountOrder"("currencyId");
CREATE INDEX IF NOT EXISTS "AccountOrder_name_idx"
  ON "AccountOrder"("name");
CREATE INDEX IF NOT EXISTS "AccountOrder_createdById_idx"
  ON "AccountOrder"("createdById");

CREATE TABLE IF NOT EXISTS "AccountOrderRecipient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "recipientNumber" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "detail" TEXT,
  "recipientDate" DATETIME NOT NULL,
  "amount" DECIMAL NOT NULL,
  "distributionFeePercent" DECIMAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AccountOrderRecipient_recipientNumber_key" UNIQUE ("recipientNumber"),
  CONSTRAINT "AccountOrderRecipient_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "AccountOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AccountOrderRecipient_orderId_deletedAt_idx"
  ON "AccountOrderRecipient"("orderId", "deletedAt");
CREATE INDEX IF NOT EXISTS "AccountOrderRecipient_deletedAt_status_idx"
  ON "AccountOrderRecipient"("deletedAt", "status");
CREATE INDEX IF NOT EXISTS "AccountOrderRecipient_name_idx"
  ON "AccountOrderRecipient"("name");
