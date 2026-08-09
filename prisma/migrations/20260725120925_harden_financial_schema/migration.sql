-- DropIndex
DROP INDEX "Currency_isActive_idx";

-- DropIndex
DROP INDEX "Customer_isActive_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "exchangeRateId" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LedgerEntry" ("amount", "createdAt", "currencyId", "direction", "exchangeRateId", "id", "memo", "transactionId", "walletId") SELECT "amount", "createdAt", "currencyId", "direction", "exchangeRateId", "id", "memo", "transactionId", "walletId" FROM "LedgerEntry";
DROP TABLE "LedgerEntry";
ALTER TABLE "new_LedgerEntry" RENAME TO "LedgerEntry";
CREATE INDEX "LedgerEntry_transactionId_createdAt_idx" ON "LedgerEntry"("transactionId", "createdAt");
CREATE INDEX "LedgerEntry_walletId_currencyId_createdAt_idx" ON "LedgerEntry"("walletId", "currencyId", "createdAt");
CREATE INDEX "LedgerEntry_currencyId_createdAt_idx" ON "LedgerEntry"("currencyId", "createdAt");
CREATE INDEX "LedgerEntry_exchangeRateId_idx" ON "LedgerEntry"("exchangeRateId");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT,
    "description" TEXT,
    "valueDate" DATETIME NOT NULL,
    "postedAt" DATETIME,
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("createdAt", "createdById", "customerId", "deletedAt", "description", "id", "postedAt", "reference", "status", "type", "updatedAt", "valueDate") SELECT "createdAt", "createdById", "customerId", "deletedAt", "description", "id", "postedAt", "reference", "status", "type", "updatedAt", "valueDate" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");
CREATE INDEX "Transaction_status_valueDate_idx" ON "Transaction"("status", "valueDate");
CREATE INDEX "Transaction_type_status_idx" ON "Transaction"("type", "status");
CREATE INDEX "Transaction_customerId_valueDate_idx" ON "Transaction"("customerId", "valueDate");
CREATE INDEX "Transaction_createdById_idx" ON "Transaction"("createdById");
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");
CREATE INDEX "Transaction_postedAt_idx" ON "Transaction"("postedAt");
CREATE TABLE "new_Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("createdAt", "customerId", "deletedAt", "id", "isActive", "name", "type", "updatedAt") SELECT "createdAt", "customerId", "deletedAt", "id", "isActive", "name", "type", "updatedAt" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE INDEX "Wallet_type_isActive_deletedAt_idx" ON "Wallet"("type", "isActive", "deletedAt");
CREATE INDEX "Wallet_customerId_idx" ON "Wallet"("customerId");
CREATE INDEX "Wallet_deletedAt_idx" ON "Wallet"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Currency_isActive_deletedAt_idx" ON "Currency"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_isActive_deletedAt_idx" ON "Customer"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "ExchangeRate_quoteCurrencyId_baseCurrencyId_effectiveAt_idx" ON "ExchangeRate"("quoteCurrencyId", "baseCurrencyId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");
