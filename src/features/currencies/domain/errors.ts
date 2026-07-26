export type CurrencyErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_CODE"
  | "BASE_CURRENCY";

export type CurrencyField = "code" | "name" | "symbol" | "isActive";

export class CurrencyError extends Error {
  readonly code: CurrencyErrorCode;
  readonly fieldErrors?: Partial<Record<CurrencyField, string>>;

  constructor(
    code: CurrencyErrorCode,
    message: string,
    fieldErrors?: CurrencyError["fieldErrors"],
  ) {
    super(message);
    this.name = "CurrencyError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isCurrencyError(error: unknown): error is CurrencyError {
  return error instanceof CurrencyError;
}
