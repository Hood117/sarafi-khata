-- Recipients are completed on save; flip default + any leftover PENDING rows.
UPDATE "AccountOrderRecipient"
SET "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP
WHERE deletedAt IS NULL AND UPPER("status") = 'PENDING';
