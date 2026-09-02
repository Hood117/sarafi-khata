-- Expand Employee profile fields (soft-delete already via deletedAt).

ALTER TABLE "Employee" ADD COLUMN "fatherName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "nationalId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "idNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "Employee" ADD COLUMN "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN "startDate" TEXT;
ALTER TABLE "Employee" ADD COLUMN "monthlySalary" TEXT;
ALTER TABLE "Employee" ADD COLUMN "salaryCurrencyCode" TEXT;
