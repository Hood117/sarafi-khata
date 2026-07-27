import { isPostingError } from "@/features/transactions/domain/errors";
import {
  TransactionError,
  type TransactionField,
} from "@/features/transactions/domain/transaction-errors";

const POSTING_FIELDS = new Set<TransactionField>([
  "reference",
  "customerWalletId",
  "cashWalletId",
  "debitWalletId",
  "creditWalletId",
  "walletId",
  "offsetWalletId",
  "fromWalletId",
  "toWalletId",
  "currencyCode",
  "fromCurrencyCode",
  "toCurrencyCode",
  "amount",
  "manualRate",
  "allowManualRateOverride",
  "valueDate",
  "description",
  "notes",
  "customerId",
  "senderCustomerId",
  "receiverCustomerId",
  "entries",
]);

export function rethrowAsTransactionError(error: unknown): never {
  if (error instanceof TransactionError) {
    throw error;
  }

  if (isPostingError(error)) {
    const field =
      error.field && POSTING_FIELDS.has(error.field as TransactionField)
        ? (error.field as TransactionField)
        : undefined;

    throw new TransactionError(
      error.code,
      error.message,
      field ? { [field]: error.message } : undefined,
    );
  }

  throw error;
}
