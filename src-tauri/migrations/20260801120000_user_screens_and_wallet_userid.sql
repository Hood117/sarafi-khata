-- Prisma Json maps to TEXT on SQLite.
ALTER TABLE "User" ADD COLUMN "allowedScreens" TEXT;

ALTER TABLE "Wallet" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");
