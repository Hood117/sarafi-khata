-- Account Orders ledger links + recipient customer (financial phase).
-- Legacy rows with NULL transactionId stay tracking-only (not auto-posted).

ALTER TABLE "AccountOrder" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "AccountOrderRecipient" ADD COLUMN "customerId" TEXT;
ALTER TABLE "AccountOrderRecipient" ADD COLUMN "payoutTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AccountOrder_transactionId_key"
  ON "AccountOrder"("transactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountOrderRecipient_payoutTransactionId_key"
  ON "AccountOrderRecipient"("payoutTransactionId");
CREATE INDEX IF NOT EXISTS "AccountOrderRecipient_customerId_idx"
  ON "AccountOrderRecipient"("customerId");
