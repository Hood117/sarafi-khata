export type TransactionErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INACTIVE"
  | "UNBALANCED";

export type TransactionField =
  | "reference"
  | "customerWalletId"
  | "cashWalletId"
  | "debitWalletId"
  | "creditWalletId"
  | "walletId"
  | "offsetWalletId"
  | "currencyCode"
  | "amount"
  | "valueDate"
  | "description"
  | "notes"
  | "customerId"
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
