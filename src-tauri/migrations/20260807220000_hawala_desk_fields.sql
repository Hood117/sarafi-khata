-- Hawala desk fields for production Sarafi workflow (ADR-041 compatible).
-- Status values remain free-text CHECK-free for SQLite; app uses:
-- PENDING, SENT, RECEIVED, COMPLETED, CANCELLED, RETURNED

ALTER TABLE "HawalaTransfer" ADD COLUMN "senderNationalId" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "senderAddress" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverNationalId" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverAddress" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverReference" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "partnerBranch" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "specialInstructions" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "purpose" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "HawalaTransfer" ADD COLUMN "expectedDeliveryDate" DATETIME;
ALTER TABLE "HawalaTransfer" ADD COLUMN "expectedDeliveryTime" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiveCurrencyId" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiveAmount" DECIMAL;
ALTER TABLE "HawalaTransfer" ADD COLUMN "exchangeRate" DECIMAL;
ALTER TABLE "HawalaTransfer" ADD COLUMN "additionalCharges" DECIMAL;
ALTER TABLE "HawalaTransfer" ADD COLUMN "discountAmount" DECIMAL;
ALTER TABLE "HawalaTransfer" ADD COLUMN "ownCommissionMode" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "partnerCommissionMode" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementType" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementDate" DATETIME;
ALTER TABLE "HawalaTransfer" ADD COLUMN "settlementNotes" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "customerNotes" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "privateNotes" TEXT;
ALTER TABLE "HawalaTransfer" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receivedAt" DATETIME;
ALTER TABLE "HawalaTransfer" ADD COLUMN "returnedAt" DATETIME;

CREATE INDEX IF NOT EXISTS "HawalaTransfer_status_priority_idx"
  ON "HawalaTransfer"("status", "priority");
CREATE INDEX IF NOT EXISTS "HawalaTransfer_purpose_idx"
  ON "HawalaTransfer"("purpose");
CREATE INDEX IF NOT EXISTS "HawalaTransfer_destinationCountry_city_idx"
  ON "HawalaTransfer"("destinationCountry", "destinationCity");

CREATE TABLE IF NOT EXISTS "HawalaEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hawalaTransferId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "summary" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HawalaEvent_hawalaTransferId_fkey"
    FOREIGN KEY ("hawalaTransferId") REFERENCES "HawalaTransfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HawalaEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HawalaEvent_hawalaTransferId_createdAt_idx"
  ON "HawalaEvent"("hawalaTransferId", "createdAt");

CREATE TABLE IF NOT EXISTS "HawalaAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hawalaTransferId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "storagePath" TEXT NOT NULL,
  "notes" TEXT,
  "uploadedById" TEXT,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "HawalaAttachment_hawalaTransferId_fkey"
    FOREIGN KEY ("hawalaTransferId") REFERENCES "HawalaTransfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HawalaAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HawalaAttachment_hawalaTransferId_deletedAt_idx"
  ON "HawalaAttachment"("hawalaTransferId", "deletedAt");
