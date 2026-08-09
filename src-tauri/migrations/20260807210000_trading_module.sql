-- Trading module: Sarafi own-inventory FX (not customer exchange).
-- Money posts only via post_transaction (TRADE_BUY / TRADE_SELL).

CREATE TABLE IF NOT EXISTS "TradingInventory" (
  "currencyId" TEXT NOT NULL PRIMARY KEY,
  "quantity" DECIMAL NOT NULL DEFAULT 0,
  "avgCost" DECIMAL NOT NULL DEFAULT 0,
  "avgCostCurrencyId" TEXT NOT NULL,
  "costValue" DECIMAL NOT NULL DEFAULT 0,
  "lastPurchaseAt" DATETIME,
  "lastSaleAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TradingInventory_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingInventory_avgCostCurrencyId_fkey"
    FOREIGN KEY ("avgCostCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TradingTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reference" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "inventoryCurrencyId" TEXT NOT NULL,
  "quantity" DECIMAL NOT NULL,
  "rate" DECIMAL NOT NULL,
  "paymentCurrencyId" TEXT NOT NULL,
  "paymentAmount" DECIMAL NOT NULL,
  "counterpartyType" TEXT NOT NULL,
  "customerId" TEXT,
  "partnerSarafiId" TEXT,
  "counterpartyName" TEXT,
  "cashWalletId" TEXT NOT NULL,
  "avgCostAtPost" DECIMAL,
  "cogsAmount" DECIMAL,
  "grossProfit" DECIMAL,
  "inventoryQtyAfter" DECIMAL,
  "notes" TEXT,
  "transactionId" TEXT,
  "valueDate" DATETIME NOT NULL,
  "createdById" TEXT,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TradingTrade_reference_key" UNIQUE ("reference"),
  CONSTRAINT "TradingTrade_inventoryCurrencyId_fkey"
    FOREIGN KEY ("inventoryCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_paymentCurrencyId_fkey"
    FOREIGN KEY ("paymentCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_partnerSarafiId_fkey"
    FOREIGN KEY ("partnerSarafiId") REFERENCES "PartnerSarafi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_cashWalletId_fkey"
    FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingTrade_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TradingTrade_transactionId_key" ON "TradingTrade"("transactionId");
CREATE INDEX IF NOT EXISTS "TradingTrade_deletedAt_direction_valueDate_idx"
  ON "TradingTrade"("deletedAt", "direction", "valueDate");
CREATE INDEX IF NOT EXISTS "TradingTrade_inventoryCurrencyId_valueDate_idx"
  ON "TradingTrade"("inventoryCurrencyId", "valueDate");
CREATE INDEX IF NOT EXISTS "TradingTrade_partnerSarafiId_valueDate_idx"
  ON "TradingTrade"("partnerSarafiId", "valueDate");
CREATE INDEX IF NOT EXISTS "TradingTrade_customerId_valueDate_idx"
  ON "TradingTrade"("customerId", "valueDate");

CREATE TABLE IF NOT EXISTS "TradingMarketRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "currencyId" TEXT NOT NULL,
  "buyRate" DECIMAL NOT NULL,
  "sellRate" DECIMAL NOT NULL,
  "marketRate" DECIMAL NOT NULL,
  "source" TEXT,
  "updatedById" TEXT,
  "effectiveAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TradingMarketRate_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradingMarketRate_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TradingMarketRate_currencyId_effectiveAt_idx"
  ON "TradingMarketRate"("currencyId", "effectiveAt");
CREATE INDEX IF NOT EXISTS "TradingMarketRate_deletedAt_effectiveAt_idx"
  ON "TradingMarketRate"("deletedAt", "effectiveAt");
