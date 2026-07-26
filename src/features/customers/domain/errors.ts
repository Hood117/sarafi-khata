export type CustomerErrorCode =
  | "DUPLICATE_PHONE"
  | "VALIDATION"
  | "NOT_FOUND";

export class CustomerError extends Error {
  readonly code: CustomerErrorCode;
  readonly fieldErrors?: Partial<
    Record<"fullName" | "phone" | "address" | "nationalId" | "notes", string>
  >;

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
