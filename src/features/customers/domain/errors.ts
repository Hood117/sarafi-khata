export type CustomerErrorCode =
  | "DUPLICATE_PHONE"
  | "DUPLICATE_CODE"
  | "VALIDATION"
  | "NOT_FOUND";

export type CustomerField =
  | "fullName"
  | "phone"
  | "address"
  | "nationalId"
  | "notes";

export class CustomerError extends Error {
  readonly code: CustomerErrorCode;
  readonly fieldErrors?: Partial<Record<CustomerField, string>>;

  constructor(
    code: CustomerErrorCode,
    message: string,
    fieldErrors?: CustomerError["fieldErrors"],
  ) {
    super(message);
    this.name = "CustomerError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isCustomerError(error: unknown): error is CustomerError {
  return error instanceof CustomerError;
}
