export type SettingsErrorCode =
  | "VALIDATION"
  | "CURRENCY_NOT_FOUND"
  | "UNKNOWN";

export type SettingsField =
  | "businessName"
  | "baseCurrencyCode"
  | "locale";

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  readonly fieldErrors?: Partial<Record<SettingsField, string>>;

  constructor(
    code: SettingsErrorCode,
    message: string,
    fieldErrors?: SettingsError["fieldErrors"],
  ) {
    super(message);
    this.name = "SettingsError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isSettingsError(error: unknown): error is SettingsError {
  return error instanceof SettingsError;
}
