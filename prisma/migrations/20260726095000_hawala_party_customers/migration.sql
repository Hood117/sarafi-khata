-- Optional per-party local customer links on hawala transfers.
-- Sender/receiver names remain denormalized for external (non-customer) parties.

ALTER TABLE "HawalaTransfer" ADD COLUMN "senderCustomerId" TEXT REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HawalaTransfer" ADD COLUMN "receiverCustomerId" TEXT REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "HawalaTransfer_senderCustomerId_idx" ON "HawalaTransfer"("senderCustomerId");
CREATE INDEX "HawalaTransfer_receiverCustomerId_idx" ON "HawalaTransfer"("receiverCustomerId");
