export type LedgerDomainErrorCode =
  | "INVALID_CURRENCY"
  | "INVALID_MONEY"
  | "CURRENCY_MISMATCH"
  | "INVALID_LEDGER_ENTRY"
  | "UNBALANCED_LEDGER";

export class LedgerDomainError extends Error {
  readonly code: LedgerDomainErrorCode;

  constructor(code: LedgerDomainErrorCode, message: string) {
    super(message);
    this.name = "LedgerDomainError";
    this.code = code;
  }
}

export function isLedgerDomainError(
  error: unknown,
): error is LedgerDomainError {
  return error instanceof LedgerDomainError;
}
