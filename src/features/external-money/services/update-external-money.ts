import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import {
  descriptionFromExternalMoneyNotes,
  isExternalMoneyTransaction,
} from "@/features/external-money/schemas/external-money-form";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import {
  findTransactionById,
  updateTransaction,
} from "@/features/transactions/repositories/transaction-repository";

export async function updateExternalMoneyRecord(input: {
  transactionId: string;
  notes: string | null;
}) {
  await requirePermission("transactions.manage");

  const existing = await findTransactionById(input.transactionId, {
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
      "Archived external money cannot be edited.",
    );
  }

  const updated = await updateTransaction(existing.id, {
    description: descriptionFromExternalMoneyNotes(input.notes),
  });
  queueAutoBackup("external-money-update");
  return updated;
}
