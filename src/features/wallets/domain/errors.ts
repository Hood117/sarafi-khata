export type WalletErrorCode = "VALIDATION" | "NOT_FOUND";

export type WalletField = "name" | "type" | "customerId";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly fieldErrors?: Partial<Record<WalletField, string>>;

  constructor(
    code: WalletErrorCode,
    message: string,
    fieldErrors?: WalletError["fieldErrors"],
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
}
