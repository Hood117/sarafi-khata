-- CreateIndex
CREATE INDEX "Transaction_createdById_valueDate_idx" ON "Transaction"("createdById", "valueDate");

-- CreateIndex
CREATE INDEX "Transaction_deletedAt_status_valueDate_idx" ON "Transaction"("deletedAt", "status", "valueDate");

-- CreateIndex
CREATE INDEX "Transaction_deletedAt_valueDate_createdAt_idx" ON "Transaction"("deletedAt", "valueDate", "createdAt");

-- CreateIndex
CREATE INDEX "HawalaTransfer_cashWalletId_idx" ON "HawalaTransfer"("cashWalletId");

-- CreateIndex
CREATE INDEX "HawalaTransfer_clearingWalletId_idx" ON "HawalaTransfer"("clearingWalletId");

-- CreateIndex
CREATE INDEX "HawalaTransfer_deletedAt_status_valueDate_idx" ON "HawalaTransfer"("deletedAt", "status", "valueDate");

-- CreateIndex
CREATE INDEX "HawalaTransfer_deletedAt_valueDate_createdAt_idx" ON "HawalaTransfer"("deletedAt", "valueDate", "createdAt");
