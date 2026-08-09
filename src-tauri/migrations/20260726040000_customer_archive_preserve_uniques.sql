-- Drop full unique indexes so archived customers can keep phone/code history
-- while new active customers may reuse those values.
DROP INDEX IF EXISTS "Customer_phone_key";
DROP INDEX IF EXISTS "Customer_code_key";

-- Enforce uniqueness only for active (non-archived) customers.
CREATE UNIQUE INDEX "Customer_phone_active_key" ON "Customer"("phone") WHERE "deletedAt" IS NULL AND "phone" IS NOT NULL;
CREATE UNIQUE INDEX "Customer_code_active_key" ON "Customer"("code") WHERE "deletedAt" IS NULL AND "code" IS NOT NULL;

-- Supporting lookup indexes for search.
CREATE INDEX IF NOT EXISTS "Customer_phone_idx" ON "Customer"("phone");
CREATE INDEX IF NOT EXISTS "Customer_code_idx" ON "Customer"("code");
