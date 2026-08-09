export type TransactionErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INACTIVE"
  | "UNBALANCED"
  | "INVALID_STATUS";

export type TransactionField =
  | "reference"
  | "customerWalletId"
  | "cashWalletId"
  | "debitWalletId"
  | "creditWalletId"
  | "walletId"
  | "offsetWalletId"
  | "fromWalletId"
  | "toWalletId"
  | "currencyCode"
  | "fromCurrencyCode"
  | "toCurrencyCode"
  | "amount"
  | "toAmount"
  | "manualRate"
  | "allowManualRateOverride"
  | "valueDate"
  | "description"
  | "notes"
  | "customerId"
  | "walkInName"
  | "walkInPhone"
  | "senderCustomerId"
  | "receiverCustomerId"
  | "entries";

export class TransactionError extends Error {
  readonly code: TransactionErrorCode;
  readonly fieldErrors?: Partial<Record<TransactionField, string>>;

  constructor(
    code: TransactionErrorCode,
    message: string,
    fieldErrors?: TransactionError["fieldErrors"],
  ) {
    super(message);
    this.name = "TransactionError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isTransactionError(
  error: unknown,
): error is TransactionError {
  return error instanceof TransactionError;
}
