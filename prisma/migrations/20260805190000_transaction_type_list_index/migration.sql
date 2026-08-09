-- CreateIndex
CREATE INDEX "Transaction_type_deletedAt_valueDate_createdAt_idx" ON "Transaction"("type", "deletedAt", "valueDate", "createdAt");
