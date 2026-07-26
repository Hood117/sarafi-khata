export type ExchangeRateErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CURRENCY_NOT_FOUND"
  | "SAME_CURRENCY";

export type ExchangeRateField =
  | "baseCurrencyId"
  | "quoteCurrencyId"
  | "rate"
  | "effectiveDate"
  | "isActive";

export class ExchangeRateError extends Error {
  readonly code: ExchangeRateErrorCode;
  readonly fieldErrors?: Partial<Record<ExchangeRateField, string>>;

  constructor(
    code: ExchangeRateErrorCode,
    message: string,
    fieldErrors?: ExchangeRateError["fieldErrors"],
  ) {
    super(message);
    this.name = "ExchangeRateError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isExchangeRateError(
  error: unknown,
): error is ExchangeRateError {
  return error instanceof ExchangeRateError;
}
