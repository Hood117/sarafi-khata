export type UserErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_USERNAME"
  | "SELF_ACTION"
  | "LAST_ADMIN";

export type UserField =
  | "fullName"
  | "username"
  | "password"
  | "confirmPassword"
  | "role"
  | "isActive"
  | "allowedScreens";

export class UserError extends Error {
  readonly code: UserErrorCode;
  readonly fieldErrors?: Partial<Record<UserField, string>>;

  constructor(
    code: UserErrorCode,
    message: string,
    fieldErrors?: UserError["fieldErrors"],
  ) {
    super(message);
    this.name = "UserError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError;
}
