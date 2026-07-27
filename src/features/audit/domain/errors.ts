export type AuditErrorCode = "NOT_FOUND" | "UNKNOWN";

export class AuditError extends Error {
  readonly code: AuditErrorCode;

  constructor(code: AuditErrorCode, message: string) {
    super(message);
    this.name = "AuditError";
    this.code = code;
  }
}

export function isAuditError(error: unknown): error is AuditError {
  return error instanceof AuditError;
}
