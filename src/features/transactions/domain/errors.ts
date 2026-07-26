export type PostingErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INACTIVE"
  | "UNBALANCED";

export class PostingError extends Error {
  readonly code: PostingErrorCode;
  readonly field?: string;

  constructor(code: PostingErrorCode, message: string, field?: string) {
    super(message);
    this.name = "PostingError";
    this.code = code;
    this.field = field;
  }
}

export function isPostingError(error: unknown): error is PostingError {
  return error instanceof PostingError;
}
