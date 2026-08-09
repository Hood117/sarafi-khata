-- AlterTable
ALTER TABLE "HawalaTransfer" ADD COLUMN "ownCommissionAmount" DECIMAL;

-- CreateIndex
CREATE INDEX "HawalaTransfer_deletedAt_direction_valueDate_createdAt_idx" ON "HawalaTransfer"("deletedAt", "direction", "valueDate", "createdAt");

-- CreateIndex
CREATE INDEX "HawalaTransfer_partnerSarafiId_commissionSide_status_deletedAt_idx" ON "HawalaTransfer"("partnerSarafiId", "commissionSide", "status", "deletedAt");
