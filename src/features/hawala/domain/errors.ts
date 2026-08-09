export type HawalaErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INACTIVE"
  | "INVALID_STATUS"
  | "UNBALANCED";

export type HawalaField =
  | "reference"
  | "senderName"
  | "senderPhone"
  | "receiverName"
  | "receiverPhone"
  | "partnerSarafi"
  | "partnerSarafiId"
  | "originCity"
  | "originCountry"
  | "destinationCity"
  | "destinationCountry"
  | "currencyCode"
  | "amount"
  | "notes"
  | "customerId"
  | "senderCustomerId"
  | "receiverCustomerId"
  | "cashWalletId"
  | "clearingWalletId"
  | "valueDate"
  | "createdById"
  | "entries"
  | "id"
  | "commissionPerAmount"
  | "commissionFeeAmount"
  | "partnerCommissionAmount"
  | "ownCommissionAmount";

export class HawalaError extends Error {
  readonly code: HawalaErrorCode;
  readonly fieldErrors?: Partial<Record<HawalaField, string>>;

  constructor(
    code: HawalaErrorCode,
    message: string,
    fieldErrors?: HawalaError["fieldErrors"],
  ) {
    super(message);
    this.name = "HawalaError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isHawalaError(error: unknown): error is HawalaError {
  return error instanceof HawalaError;
}
