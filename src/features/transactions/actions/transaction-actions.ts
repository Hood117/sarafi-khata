"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  isTransactionError,
  type TransactionErrorCode,
  type TransactionField,
} from "@/features/transactions/domain/transaction-errors";
import type {
  DepositInput,
  ManualAdjustmentInput,
  WithdrawalInput,
} from "@/features/transactions/schemas/money-movement";
import { adjustFunds } from "@/features/transactions/services/adjust";
import { depositFunds } from "@/features/transactions/services/deposit";
import { withdrawFunds } from "@/features/transactions/services/withdraw";

export type TransactionFieldErrors = Partial<Record<TransactionField, string>>;

export type TransactionMutationActionResult =
  | {
      ok: true;
      message: string;
      transactionId: string;
      reference: string;
    }
  | {
      ok: false;
      code: TransactionErrorCode | "UNKNOWN";
      message: string;
      fieldErrors?: TransactionFieldErrors;
    };

export type DepositActionInput = DepositInput;
export type WithdrawalActionInput = WithdrawalInput;
export type ManualAdjustmentActionInput = ManualAdjustmentInput;

export type DepositActionResult = TransactionMutationActionResult;
export type WithdrawalActionResult = TransactionMutationActionResult;
export type ManualAdjustmentActionResult = TransactionMutationActionResult;

function toMutationFailure(
  error: unknown,
  fallbackMessage: string,
): TransactionMutationActionResult {
  if (isTransactionError(error)) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  return {
    ok: false,
    code: "UNKNOWN",
    message: fallbackMessage,
  };
}

export async function depositAction(
  input: DepositActionInput,
): Promise<DepositActionResult> {
  const user = await requirePermission("transactions.manage");

  try {
    const transaction = await depositFunds({
      ...input,
      createdById: user.id,
    });

    return {
      ok: true,
      message: `Deposit ${transaction.reference} was posted successfully.`,
      transactionId: transaction.id,
      reference: transaction.reference,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to post deposit. Please try again.",
    );
  }
}

export async function withdrawalAction(
  input: WithdrawalActionInput,
): Promise<WithdrawalActionResult> {
  const user = await requirePermission("transactions.manage");

  try {
    const transaction = await withdrawFunds({
      ...input,
      createdById: user.id,
    });

    return {
      ok: true,
      message: `Withdrawal ${transaction.reference} was posted successfully.`,
      transactionId: transaction.id,
      reference: transaction.reference,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to post withdrawal. Please try again.",
    );
  }
}

export async function manualAdjustmentAction(
  input: ManualAdjustmentActionInput,
): Promise<ManualAdjustmentActionResult> {
  const user = await requirePermission("transactions.manage");

  try {
    const transaction = await adjustFunds({
      ...input,
      createdById: user.id,
    });

    return {
      ok: true,
      message: `Adjustment ${transaction.reference} was posted successfully.`,
      transactionId: transaction.id,
      reference: transaction.reference,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to post adjustment. Please try again.",
    );
  }
}
