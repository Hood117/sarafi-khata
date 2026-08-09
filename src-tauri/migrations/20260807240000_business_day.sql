-- Business day open/close for Daybook (Daily Journal).
-- Operational snapshot only; balances always derive from ledger.

CREATE TABLE IF NOT EXISTS "BusinessDay" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt" DATETIME NOT NULL,
  "openedById" TEXT,
  "closedAt" DATETIME,
  "closedById" TEXT,
  "differenceReason" TEXT,
  "notes" TEXT,
  "transactionCount" INTEGER,
  "profitSnapshot" TEXT,
  "expenseSnapshot" TEXT,
  "hasCashDifference" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BusinessDay_openedById_fkey"
    FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BusinessDay_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDay_businessDate_key"
  ON "BusinessDay"("businessDate");
CREATE INDEX IF NOT EXISTS "BusinessDay_status_businessDate_idx"
  ON "BusinessDay"("status", "businessDate");

CREATE TABLE IF NOT EXISTS "BusinessDayCashCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessDayId" TEXT NOT NULL,
  "currencyId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "openingAmount" DECIMAL NOT NULL DEFAULT 0,
  "cashReceived" DECIMAL NOT NULL DEFAULT 0,
  "cashPaid" DECIMAL NOT NULL DEFAULT 0,
  "expectedClosing" DECIMAL NOT NULL DEFAULT 0,
  "actualClosing" DECIMAL,
  "difference" DECIMAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BusinessDayCashCount_businessDayId_fkey"
    FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BusinessDayCashCount_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDayCashCount_day_currency_key"
  ON "BusinessDayCashCount"("businessDayId", "currencyId");
CREATE INDEX IF NOT EXISTS "BusinessDayCashCount_businessDayId_idx"
  ON "BusinessDayCashCount"("businessDayId");
