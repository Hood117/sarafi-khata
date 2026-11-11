-- Archived customers (deletedAt set) are auto-purged from the archive list after 30 days.
-- Transactions stay linked; Daybook/search keep history via Customer.fullName.
ALTER TABLE "Customer" ADD COLUMN "purgedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "Customer_purgedAt_idx" ON "Customer"("purgedAt");
CREATE INDEX IF NOT EXISTS "Customer_deletedAt_purgedAt_idx" ON "Customer"("deletedAt", "purgedAt");
