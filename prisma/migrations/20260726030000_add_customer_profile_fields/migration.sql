-- DropIndex
DROP INDEX "Customer_phone_idx";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN "nationalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
