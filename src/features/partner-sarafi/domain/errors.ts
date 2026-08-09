export type PartnerSarafiErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "INSUFFICIENT_COMMISSION"
  | "UNKNOWN";

export type PartnerSarafiField =
  | "name"
  | "phone"
  | "city"
  | "country"
  | "notes"
  | "isActive"
  | "commissionEnabled"
  | "commissionPerAmount"
  | "commissionFeeAmount"
  | "commissionCurrencyCode"
  | "amount"
  | "cashWalletId"
  | "currencyCode";

export class PartnerSarafiError extends Error {
  readonly code: PartnerSarafiErrorCode;
  readonly fieldErrors?: Partial<Record<PartnerSarafiField, string>>;

  constructor(
    code: PartnerSarafiErrorCode,
    message: string,
    fieldErrors?: PartnerSarafiError["fieldErrors"],
  ) {
    super(message);
    this.name = "PartnerSarafiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isPartnerSarafiError(
  error: unknown,
): error is PartnerSarafiError {
  return error instanceof PartnerSarafiError;
}
