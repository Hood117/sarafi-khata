import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import { isExternalMoneyTransaction } from "@/features/external-money/schemas/external-money-form";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import {
  findTransactionById,
  softDeleteTransaction,
} from "@/features/transactions/repositories/transaction-repository";

export async function archiveExternalMoneyRecord(transactionId: string) {
  await requirePermission("transactions.manage");

  const existing = await findTransactionById(transactionId, {
    includeDeleted: true,
  });
  if (
    !existing ||
    !isExternalMoneyTransaction({
      type: existing.type,
      reference: existing.reference,
      description: existing.description,
    })
  ) {
    throw new TransactionError(
      "NOT_FOUND",
      "External money record was not found.",
    );
  }
  if (existing.deletedAt) {
    throw new TransactionError(
      "VALIDATION",
      "This external money entry is already archived.",
    );
  }

  const archived = await softDeleteTransaction(existing.id);
  queueAutoBackup("external-money-archive");
  return archived;
}
