import "server-only";

import { HawalaError, type HawalaField } from "@/features/hawala/domain/errors";
import { isPostingError } from "@/features/transactions/domain/errors";

const POSTING_FIELDS = new Set<HawalaField>([
  "reference",
  "currencyCode",
  "amount",
  "valueDate",
  "notes",
  "customerId",
  "cashWalletId",
  "clearingWalletId",
  "entries",
]);

export function rethrowAsHawalaError(error: unknown): never {
  if (error instanceof HawalaError) {
    throw error;
  }

  if (isPostingError(error)) {
    const field =
      error.field && POSTING_FIELDS.has(error.field as HawalaField)
        ? (error.field as HawalaField)
        : undefined;

    throw new HawalaError(
      error.code === "UNBALANCED" ? "UNBALANCED" : error.code,
      error.message,
      field ? { [field]: error.message } : undefined,
    );
  }

  throw error;
}
