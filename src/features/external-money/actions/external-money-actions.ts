"use server";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_MODULES } from "@/features/audit";
import { auditAction } from "@/features/audit/services/audit-action";
import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  addExternalMoneySchema,
  archiveExternalMoneySchema,
  displayExternalMoneyReference,
  notesFromExternalMoneyDescription,
  toAddExternalMoneyFieldErrors,
  toUpdateExternalMoneyFieldErrors,
  updateExternalMoneySchema,
  type AddExternalMoneyFieldErrors,
  type UpdateExternalMoneyFieldErrors,
} from "@/features/external-money/schemas/external-money-form";
import { archiveExternalMoneyRecord } from "@/features/external-money/services/archive-external-money";
import { postExternalMoney } from "@/features/external-money/services/post-external-money";
import { updateExternalMoneyRecord } from "@/features/external-money/services/update-external-money";
import { isTransactionError } from "@/features/transactions/domain/transaction-errors";
import { findTransactionById } from "@/features/transactions/repositories/transaction-repository";

export type AddExternalMoneyActionInput = {
  currencyCode: string;
  amount: string;
  cashWalletId?: string | null;
  notes?: string | null;
};

export type AddExternalMoneyActionResult =
  | {
      ok: true;
      message: string;
      transactionId: string;
      reference: string;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: AddExternalMoneyFieldErrors;
    };

export async function addExternalMoneyAction(
  input: AddExternalMoneyActionInput,
): Promise<AddExternalMoneyActionResult> {
  const user = await requirePermission("transactions.manage");

  const parsed = addExternalMoneySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: toAddExternalMoneyFieldErrors(parsed.error),
    };
  }

  try {
    const transaction = await postExternalMoney({
      ...parsed.data,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: transaction.id,
      afterValues: {
        type: "EXTERNAL_MONEY",
        reference: transaction.reference,
        currencyCode: parsed.data.currencyCode,
        amount: parsed.data.amount,
        cashWalletId: parsed.data.cashWalletId,
        notes: parsed.data.notes,
      },
    });

    return {
      ok: true,
      message: `External money ${transaction.reference} was posted successfully.`,
      transactionId: transaction.id,
      reference: transaction.reference,
    };
  } catch (error) {
    if (isTransactionError(error)) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: error.fieldErrors as AddExternalMoneyFieldErrors | undefined,
      };
    }

    return {
      ok: false,
      message: "Unable to add external money. Please try again.",
    };
  }
}

export type UpdateExternalMoneyActionInput = {
  transactionId: string;
  notes?: string | null;
};

export type UpdateExternalMoneyActionResult =
  | {
      ok: true;
      message: string;
      transactionId: string;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: UpdateExternalMoneyFieldErrors;
    };

export async function updateExternalMoneyAction(
  input: UpdateExternalMoneyActionInput,
): Promise<UpdateExternalMoneyActionResult> {
  const user = await requirePermission("transactions.manage");

  const parsed = updateExternalMoneySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: toUpdateExternalMoneyFieldErrors(parsed.error),
    };
  }

  try {
    const existing = await findTransactionById(parsed.data.transactionId);
    const beforeNotes = notesFromExternalMoneyDescription(existing?.description);
    const updated = await updateExternalMoneyRecord(parsed.data);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_UPDATE,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: updated.id,
      beforeValues: {
        reference: existing?.reference ?? null,
        notes: beforeNotes,
      },
      afterValues: {
        reference: updated.reference,
        notes: parsed.data.notes,
      },
    });

    return {
      ok: true,
      message: `External money ${displayExternalMoneyReference(updated.reference)} was updated.`,
      transactionId: updated.id,
    };
  } catch (error) {
    if (isTransactionError(error)) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: error.fieldErrors as
          | UpdateExternalMoneyFieldErrors
          | undefined,
      };
    }

    return {
      ok: false,
      message: "Unable to update external money. Please try again.",
    };
  }
}

export type ArchiveExternalMoneyActionInput = {
  transactionId: string;
};

export type ArchiveExternalMoneyActionResult =
  | {
      ok: true;
      message: string;
      transactionId: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function archiveExternalMoneyAction(
  input: ArchiveExternalMoneyActionInput,
): Promise<ArchiveExternalMoneyActionResult> {
  const user = await requirePermission("transactions.manage");

  const parsed = archiveExternalMoneySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Record is required.",
    };
  }

  try {
    const existing = await findTransactionById(parsed.data.transactionId);
    const reference = existing
      ? displayExternalMoneyReference(existing.reference)
      : parsed.data.transactionId;
    const archived = await archiveExternalMoneyRecord(
      parsed.data.transactionId,
    );

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_ARCHIVE,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: archived.id,
      beforeValues: {
        reference,
        deletedAt: null,
      },
      afterValues: {
        reference: displayExternalMoneyReference(archived.reference),
        deletedAt: archived.deletedAt?.toISOString() ?? null,
      },
    });

    return {
      ok: true,
      message: `External money ${reference} was archived.`,
      transactionId: archived.id,
    };
  } catch (error) {
    if (isTransactionError(error)) {
      return {
        ok: false,
        message: error.message,
      };
    }

    return {
      ok: false,
      message: "Unable to archive external money. Please try again.",
    };
  }
}
