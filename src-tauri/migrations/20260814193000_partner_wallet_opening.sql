-- Partner Sarafi claim wallets for Opening Kata (Opening Equity only — never Main Vault).
ALTER TABLE "Wallet" ADD COLUMN "partnerSarafiId" TEXT;

CREATE INDEX IF NOT EXISTS "Wallet_partnerSarafiId_idx"
  ON "Wallet"("partnerSarafiId");
