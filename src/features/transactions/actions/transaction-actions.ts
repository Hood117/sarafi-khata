"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { EXCHANGE_BUSINESS_RULES } from "@/features/exchange/domain/business-rules";
import {
  isTransactionError,
  type TransactionErrorCode,
  type TransactionField,
} from "@/features/transactions/domain/transaction-errors";
import type {
  DepositInput,
  ExchangeInput,
  ManualAdjustmentInput,
  TransferInput,
  WithdrawalInput,
} from "@/features/transactions/schemas/money-movement";
import { adjustFunds } from "@/features/transactions/services/adjust";
import { depositFunds } from "@/features/transactions/services/deposit";
import { exchangeFunds } from "@/features/transactions/services/exchange";
import { transferFunds } from "@/features/transactions/services/transfer";
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
export type CreateExchangeActionInput = ExchangeInput;
export type CreateTransferActionInput = TransferInput;

export type DepositActionResult = TransactionMutationActionResult;
export type WithdrawalActionResult = TransactionMutationActionResult;
export type ManualAdjustmentActionResult = TransactionMutationActionResult;
export type CreateExchangeActionResult = TransactionMutationActionResult;
export type CreateTransferActionResult = TransactionMutationActionResult;

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

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_DEPOSIT,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: transaction.id,
      afterValues: {
        type: "DEPOSIT",
        reference: transaction.reference,
        currencyCode: input.currencyCode,
        amount: input.amount,
        customerWalletId: input.customerWalletId,
        cashWalletId: input.cashWalletId,
        description: input.description ?? null,
      },
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

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_WITHDRAWAL,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: transaction.id,
      afterValues: {
        type: "WITHDRAWAL",
        reference: transaction.reference,
        currencyCode: input.currencyCode,
        amount: input.amount,
        customerWalletId: input.customerWalletId,
        cashWalletId: input.cashWalletId,
        description: input.description ?? null,
      },
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

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_ADJUSTMENT,
      module: AUDIT_MODULES.TRANSACTIONS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: transaction.id,
      afterValues: {
        type: "ADJUSTMENT",
        reference: transaction.reference,
        currencyCode: input.currencyCode,
        amount: input.amount,
        debitWalletId: input.debitWalletId,
        creditWalletId: input.creditWalletId,
        customerId: input.customerId ?? null,
        description: input.description ?? null,
      },
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

/**
 * Create a currency exchange. Calls `exchangeFunds` only — never posts ledger
 * lines directly from the action/UI layer.
 */
export async function createExchangeAction(
  input: CreateExchangeActionInput,
): Promise<CreateExchangeActionResult> {
  const user = await requirePermission("transactions.manage");

  try {
    const allowManualRateOverride =
      EXCHANGE_BUSINESS_RULES.allowManualRateOverride &&
      (input.allowManualRateOverride ?? false);

    const result = await exchangeFunds({
      ...input,
      allowManualRateOverride,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_EXCHANGE,
      module: AUDIT_MODULES.EXCHANGE,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: result.transaction.id,
      afterValues: {
        type: "EXCHANGE",
        reference: result.transaction.reference,
        customerId: input.customerId,
        fromCurrencyCode: input.fromCurrencyCode,
        toCurrencyCode: input.toCurrencyCode,
        amount: input.amount,
        fromWalletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        allowManualRateOverride,
        manualRate: allowManualRateOverride ? (input.manualRate ?? null) : null,
        description: input.description ?? null,
      },
    });

    return {
      ok: true,
      message: `Exchange ${result.transaction.reference} was posted successfully.`,
      transactionId: result.transaction.id,
      reference: result.transaction.reference,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to post exchange. Please try again.",
    );
  }
}

/**
 * Create a customer-to-customer transfer. Calls `transferFunds` only — never
 * calls `postTransaction` or writes ledger lines from the action/UI layer.
 */
export async function createTransferAction(
  input: CreateTransferActionInput,
): Promise<CreateTransferActionResult> {
  const user = await requirePermission("transactions.manage");

  try {
    const transaction = await transferFunds({
      ...input,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_TRANSFER,
      module: AUDIT_MODULES.TRANSFERS,
      entityType: AUDIT_ENTITY_TYPES.TRANSACTION,
      entityId: transaction.id,
      afterValues: {
        type: "TRANSFER",
        reference: transaction.reference,
        senderCustomerId: input.senderCustomerId,
        receiverCustomerId: input.receiverCustomerId,
        currencyCode: input.currencyCode,
        amount: input.amount,
        description: input.description ?? null,
      },
    });

    return {
      ok: true,
      message: `Transfer ${transaction.reference} was posted successfully.`,
      transactionId: transaction.id,
      reference: transaction.reference,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to post transfer. Please try again.",
    );
  }
}
