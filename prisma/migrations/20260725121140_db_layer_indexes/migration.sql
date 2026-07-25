-- DropIndex
DROP INDEX "Session_userId_idx";

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Wallet_name_type_idx" ON "Wallet"("name", "type");
