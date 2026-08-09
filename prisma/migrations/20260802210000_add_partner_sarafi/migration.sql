-- CreateTable
CREATE TABLE "PartnerSarafi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "receiverName", "receiverPhone", "partnerSarafi", "originCity", "originCountry",
    "destinationCity", "destinationCountry", "currencyId", "amount", "notes",
    "customerId", "senderCustomerId", "receiverCustomerId", "cashWalletId",
    "clearingWalletId", "transactionId", "createdById", "valueDate", "completedAt",
    "cancelledAt", "deletedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "reference", "direction", "status", "senderName", "senderPhone",
    "receiverName", "receiverPhone", "partnerSarafi", "originCity", "originCountry",
    "destinationCity", "destinationCountry", "currencyId", "amount", "notes",
    "customerId", "senderCustomerId", "receiverCustomerId", "cashWalletId",
    "clearingWalletId", "transactionId", "createdById", "valueDate", "completedAt",
    "cancelledAt", "deletedAt", "createdAt", "updatedAt"
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
CREATE INDEX "HawalaTransfer_cashWalletId_idx" ON "HawalaTransfer"("cashWalletId");
CREATE INDEX "HawalaTransfer_clearingWalletId_idx" ON "HawalaTransfer"("clearingWalletId");
CREATE INDEX "HawalaTransfer_deletedAt_idx" ON "HawalaTransfer"("deletedAt");
CREATE INDEX "HawalaTransfer_deletedAt_status_valueDate_idx" ON "HawalaTransfer"("deletedAt", "status", "valueDate");
CREATE INDEX "HawalaTransfer_deletedAt_valueDate_createdAt_idx" ON "HawalaTransfer"("deletedAt", "valueDate", "createdAt");
CREATE INDEX "HawalaTransfer_completedAt_idx" ON "HawalaTransfer"("completedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "PartnerSarafi_name_idx" ON "PartnerSarafi"("name");
CREATE INDEX "PartnerSarafi_isActive_deletedAt_idx" ON "PartnerSarafi"("isActive", "deletedAt");
CREATE INDEX "PartnerSarafi_deletedAt_idx" ON "PartnerSarafi"("deletedAt");

-- Backfill distinct partner names from existing hawala rows.
INSERT INTO "PartnerSarafi" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT
  'ps-' || lower(hex(randomblob(8))),
  names."partnerSarafi",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT trim("partnerSarafi") AS "partnerSarafi"
  FROM "HawalaTransfer"
  WHERE trim("partnerSarafi") <> ''
) AS names;

UPDATE "HawalaTransfer"
SET "partnerSarafiId" = (
  SELECT "id" FROM "PartnerSarafi"
  WHERE "PartnerSarafi"."name" = "HawalaTransfer"."partnerSarafi"
  LIMIT 1
)
WHERE "partnerSarafiId" IS NULL;
