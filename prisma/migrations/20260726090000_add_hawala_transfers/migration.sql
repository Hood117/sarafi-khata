-- CreateTable
CREATE TABLE "HawalaTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT,
    "receiverName" TEXT NOT NULL,
    "receiverPhone" TEXT,
    "partnerSarafi" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "notes" TEXT,
    "customerId" TEXT,
    "cashWalletId" TEXT NOT NULL,
    "clearingWalletId" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdById" TEXT NOT NULL,
    "valueDate" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HawalaTransfer_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_cashWalletId_fkey" FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_clearingWalletId_fkey" FOREIGN KEY ("clearingWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HawalaTransfer_reference_key" ON "HawalaTransfer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "HawalaTransfer_transactionId_key" ON "HawalaTransfer"("transactionId");

-- CreateIndex
CREATE INDEX "HawalaTransfer_status_valueDate_idx" ON "HawalaTransfer"("status", "valueDate");

-- CreateIndex
CREATE INDEX "HawalaTransfer_direction_status_idx" ON "HawalaTransfer"("direction", "status");

-- CreateIndex
CREATE INDEX "HawalaTransfer_customerId_valueDate_idx" ON "HawalaTransfer"("customerId", "valueDate");

-- CreateIndex
CREATE INDEX "HawalaTransfer_createdById_idx" ON "HawalaTransfer"("createdById");

-- CreateIndex
CREATE INDEX "HawalaTransfer_currencyId_idx" ON "HawalaTransfer"("currencyId");

-- CreateIndex
CREATE INDEX "HawalaTransfer_deletedAt_idx" ON "HawalaTransfer"("deletedAt");

-- CreateIndex
CREATE INDEX "HawalaTransfer_completedAt_idx" ON "HawalaTransfer"("completedAt");
