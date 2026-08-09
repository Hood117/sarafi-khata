-- Partner hawala commission rates + settlement (ADR-040)
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "new_PartnerSarafi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionPerAmount" DECIMAL,
    "commissionFeeAmount" DECIMAL,
    "commissionCurrencyId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerSarafi_commissionCurrencyId_fkey" FOREIGN KEY ("commissionCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_PartnerSarafi" (
  "id", "name", "phone", "city", "country", "notes", "isActive",
  "commissionEnabled", "commissionPerAmount", "commissionFeeAmount", "commissionCurrencyId",
  "deletedAt", "createdAt", "updatedAt"
)
SELECT
  "id", "name", "phone", "city", "country", "notes", "isActive",
  false, NULL, NULL, NULL,
  "deletedAt", "createdAt", "updatedAt"
FROM "PartnerSarafi";

DROP TABLE "PartnerSarafi";
ALTER TABLE "new_PartnerSarafi" RENAME TO "PartnerSarafi";

CREATE INDEX "PartnerSarafi_name_idx" ON "PartnerSarafi"("name");
CREATE INDEX "PartnerSarafi_isActive_deletedAt_idx" ON "PartnerSarafi"("isActive", "deletedAt");
CREATE INDEX "PartnerSarafi_deletedAt_idx" ON "PartnerSarafi"("deletedAt");
CREATE INDEX "PartnerSarafi_commissionCurrencyId_idx" ON "PartnerSarafi"("commissionCurrencyId");

-- CreateTable
CREATE TABLE "new_HawalaTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT,
    "receiverName" TEXT NOT NULL,
    "receiverPhone" TEXT,
    "partnerSarafi" TEXT NOT NULL,
    "partnerSarafiId" TEXT,
    "originCity" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "commissionAmount" DECIMAL,
    "commissionCurrencyId" TEXT,
    "commissionSide" TEXT,
    "notes" TEXT,
    "customerId" TEXT,
    "senderCustomerId" TEXT,
    "receiverCustomerId" TEXT,
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
    CONSTRAINT "HawalaTransfer_commissionCurrencyId_fkey" FOREIGN KEY ("commissionCurrencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_partnerSarafiId_fkey" FOREIGN KEY ("partnerSarafiId") REFERENCES "PartnerSarafi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_senderCustomerId_fkey" FOREIGN KEY ("senderCustomerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_receiverCustomerId_fkey" FOREIGN KEY ("receiverCustomerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_cashWalletId_fkey" FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_clearingWalletId_fkey" FOREIGN KEY ("clearingWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HawalaTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_HawalaTransfer" (
  "id", "reference", "direction", "status", "senderName", "senderPhone",
  "receiverName", "receiverPhone", "partnerSarafi", "partnerSarafiId",
  "originCity", "originCountry", "destinationCity", "destinationCountry",
  "currencyId", "amount", "commissionAmount", "commissionCurrencyId", "commissionSide",
  "notes", "customerId", "senderCustomerId", "receiverCustomerId",
  "cashWalletId", "clearingWalletId", "transactionId", "createdById",
  "valueDate", "completedAt", "cancelledAt", "deletedAt", "createdAt", "updatedAt"
)
SELECT
  "id", "reference", "direction", "status", "senderName", "senderPhone",
  "receiverName", "receiverPhone", "partnerSarafi", "partnerSarafiId",
  "originCity", "originCountry", "destinationCity", "destinationCountry",
  "currencyId", "amount", NULL, NULL, NULL,
  "notes", "customerId", "senderCustomerId", "receiverCustomerId",
  "cashWalletId", "clearingWalletId", "transactionId", "createdById",
  "valueDate", "completedAt", "cancelledAt", "deletedAt", "createdAt", "updatedAt"
FROM "HawalaTransfer";

DROP TABLE "HawalaTransfer";
ALTER TABLE "new_HawalaTransfer" RENAME TO "HawalaTransfer";

CREATE UNIQUE INDEX "HawalaTransfer_reference_key" ON "HawalaTransfer"("reference");
CREATE UNIQUE INDEX "HawalaTransfer_transactionId_key" ON "HawalaTransfer"("transactionId");
CREATE INDEX "HawalaTransfer_status_valueDate_idx" ON "HawalaTransfer"("status", "valueDate");
CREATE INDEX "HawalaTransfer_direction_status_idx" ON "HawalaTransfer"("direction", "status");
CREATE INDEX "HawalaTransfer_customerId_valueDate_idx" ON "HawalaTransfer"("customerId", "valueDate");
CREATE INDEX "HawalaTransfer_senderCustomerId_idx" ON "HawalaTransfer"("senderCustomerId");
CREATE INDEX "HawalaTransfer_receiverCustomerId_idx" ON "HawalaTransfer"("receiverCustomerId");
CREATE INDEX "HawalaTransfer_partnerSarafiId_idx" ON "HawalaTransfer"("partnerSarafiId");
CREATE INDEX "HawalaTransfer_createdById_idx" ON "HawalaTransfer"("createdById");
CREATE INDEX "HawalaTransfer_currencyId_idx" ON "HawalaTransfer"("currencyId");
CREATE INDEX "HawalaTransfer_commissionCurrencyId_idx" ON "HawalaTransfer"("commissionCurrencyId");
CREATE INDEX "HawalaTransfer_commissionSide_idx" ON "HawalaTransfer"("commissionSide");
CREATE INDEX "HawalaTransfer_cashWalletId_idx" ON "HawalaTransfer"("cashWalletId");
CREATE INDEX "HawalaTransfer_clearingWalletId_idx" ON "HawalaTransfer"("clearingWalletId");
CREATE INDEX "HawalaTransfer_deletedAt_idx" ON "HawalaTransfer"("deletedAt");
CREATE INDEX "HawalaTransfer_deletedAt_status_valueDate_idx" ON "HawalaTransfer"("deletedAt", "status", "valueDate");
CREATE INDEX "HawalaTransfer_deletedAt_valueDate_createdAt_idx" ON "HawalaTransfer"("deletedAt", "valueDate", "createdAt");
CREATE INDEX "HawalaTransfer_completedAt_idx" ON "HawalaTransfer"("completedAt");

-- CreateTable
CREATE TABLE "PartnerCommissionSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerSarafiId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "cashWalletId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "notes" TEXT,
    "valueDate" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerCommissionSettlement_partnerSarafiId_fkey" FOREIGN KEY ("partnerSarafiId") REFERENCES "PartnerSarafi" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommissionSettlement_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommissionSettlement_cashWalletId_fkey" FOREIGN KEY ("cashWalletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommissionSettlement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommissionSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerCommissionSettlement_transactionId_key" ON "PartnerCommissionSettlement"("transactionId");
CREATE INDEX "PartnerCommissionSettlement_partnerSarafiId_valueDate_idx" ON "PartnerCommissionSettlement"("partnerSarafiId", "valueDate");
CREATE INDEX "PartnerCommissionSettlement_currencyId_idx" ON "PartnerCommissionSettlement"("currencyId");
CREATE INDEX "PartnerCommissionSettlement_kind_valueDate_idx" ON "PartnerCommissionSettlement"("kind", "valueDate");
CREATE INDEX "PartnerCommissionSettlement_createdById_idx" ON "PartnerCommissionSettlement"("createdById");

PRAGMA foreign_keys=ON;
