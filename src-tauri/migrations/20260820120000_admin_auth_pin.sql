-- System Administrator Transaction Authorization PIN (bcrypt hash only).
-- Never stores the PIN in plain text. Sequence never resets.

ALTER TABLE "User" ADD COLUMN "authPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "authPinFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "authPinLockedUntil" TEXT;
