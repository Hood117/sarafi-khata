-- Exchange deal P/L (board vs deal rate). Linked to EXCHANGE transactions.

CREATE TABLE IF NOT EXISTS "ExchangeDeal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "fromCurrencyId" TEXT NOT NULL,
  "toCurrencyId" TEXT NOT NULL,
  "fromAmount" DECIMAL NOT NULL,
  "toAmount" DECIMAL NOT NULL,
  "highCurrencyId" TEXT NOT NULL,
  "lowCurrencyId" TEXT NOT NULL,
  "dealRate" DECIMAL NOT NULL,
  "boardRate" DECIMAL,
  "side" TEXT NOT NULL,
  "profitAmount" DECIMAL NOT NULL DEFAULT 0,
  "profitCurrencyId" TEXT NOT NULL,
  "valueDate" DATETIME NOT NULL,
  "createdById" TEXT,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExchangeDeal_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_fromCurrencyId_fkey"
    FOREIGN KEY ("fromCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_toCurrencyId_fkey"
    FOREIGN KEY ("toCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_highCurrencyId_fkey"
    FOREIGN KEY ("highCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_lowCurrencyId_fkey"
    FOREIGN KEY ("lowCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_profitCurrencyId_fkey"
    FOREIGN KEY ("profitCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeDeal_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeDeal_transactionId_key"
  ON "ExchangeDeal"("transactionId");
CREATE INDEX IF NOT EXISTS "ExchangeDeal_valueDate_idx"
  ON "ExchangeDeal"("valueDate");
CREATE INDEX IF NOT EXISTS "ExchangeDeal_deletedAt_valueDate_idx"
  ON "ExchangeDeal"("deletedAt", "valueDate");
