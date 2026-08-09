-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "fatherName" TEXT;

-- CreateIndex
CREATE INDEX "Customer_fatherName_idx" ON "Customer"("fatherName");
