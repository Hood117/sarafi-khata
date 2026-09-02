-- Link PartnerSarafi to an existing Customer. Nullable so current partners
-- keep working until they are linked. One live partner per customer.
ALTER TABLE "PartnerSarafi" ADD COLUMN "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "PartnerSarafi_customerId_idx"
  ON "PartnerSarafi"("customerId");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSarafi_customerId_live_key"
  ON "PartnerSarafi"("customerId")
  WHERE "customerId" IS NOT NULL AND "deletedAt" IS NULL;
