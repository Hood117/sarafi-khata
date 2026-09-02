-- Employees and salary payments (dynamic amounts; posts EXPENSE to Salary SYSTEM wallet).

CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "title" TEXT,
  "notes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "Employee_isActive_fullName_idx"
  ON "Employee"("isActive", "fullName");
CREATE INDEX IF NOT EXISTS "Employee_deletedAt_idx"
  ON "Employee"("deletedAt");

CREATE TABLE IF NOT EXISTS "EmployeeSalaryPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "currencyId" TEXT NOT NULL,
  "amount" DECIMAL NOT NULL,
  "cashWalletId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "notes" TEXT,
  "valueDate" DATETIME NOT NULL,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EmployeeSalaryPayment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeSalaryPayment_currencyId_fkey"
    FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeSalaryPayment_cashWalletId_fkey"
    FOREIGN KEY ("cashWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeSalaryPayment_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeSalaryPayment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSalaryPayment_transactionId_key"
  ON "EmployeeSalaryPayment"("transactionId");
CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_employeeId_valueDate_idx"
  ON "EmployeeSalaryPayment"("employeeId", "valueDate");
CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_valueDate_idx"
  ON "EmployeeSalaryPayment"("valueDate");
CREATE INDEX IF NOT EXISTS "EmployeeSalaryPayment_currencyId_idx"
  ON "EmployeeSalaryPayment"("currencyId");
