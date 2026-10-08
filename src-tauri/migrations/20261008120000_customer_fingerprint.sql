-- Optional enrolled fingerprint template (Base64). Null = not enrolled.
ALTER TABLE "Customer" ADD COLUMN "fingerprintTemplate" TEXT;
