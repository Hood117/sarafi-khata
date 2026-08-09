export type CustomerErrorCode =
  | "DUPLICATE_PHONE"
  | "DUPLICATE_CODE"
  | "VALIDATION"
  | "NOT_FOUND";

export type CustomerField =
  | "fullName"
  | "fatherName"
  | "phone"
  | "address"
  | "nationalId"
  | "notes"
  | "openingBalanceAmount"
  | "openingBalanceCurrencyCode";

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
  if (error instanceof CustomerError) {
    return true;
  }

  // Server Actions can duplicate the class across bundles, so `instanceof` alone
  // is not reliable — fall back to the error shape/name.
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    fieldErrors?: unknown;
  };

  return (
    candidate.name === "CustomerError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}
