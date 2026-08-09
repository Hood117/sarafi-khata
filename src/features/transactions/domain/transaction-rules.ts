import {
  assertLedgerBalanced,
  isLedgerDomainError,
  toCurrencyCode,
  validateLedgerEntries,
  type CurrencyCode,
  type LedgerEntryInput,
} from "@/features/ledger/domain";
import { TransactionType } from "@/generated/prisma/client";
import { PostingError } from "@/features/transactions/domain/errors";
import type {
  PostingLineInput,
  PostTransactionInput,
} from "@/features/transactions/domain/types";

const TRANSACTION_TYPES = new Set<string>(Object.values(TransactionType));

export function isTransactionType(value: string): value is TransactionType {
  return TRANSACTION_TYPES.has(value);
}

export type NormalizedPostTransactionInput = {
  reference: string;
  type: TransactionType;
  valueDate: Date;
  customerId: string | null;
  walkInName: string | null;
  walkInPhone: string | null;
  description: string | null;
  createdById: string | null;
  entries: PostingLineInput[];
  domainEntries: LedgerEntryInput[];
};

function requireDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PostingError(
      "VALIDATION",
      "A valid value date is required.",
      field,
    );
  }

  return value;
}

/**
 * Normalize and validate posting request shape + domain ledger rules (before DB checks).
 */
export function normalizePostTransactionInput(
  input: PostTransactionInput,
): NormalizedPostTransactionInput {
  const reference = input.reference?.trim() ?? "";

  if (!reference) {
    throw new PostingError(
      "VALIDATION",
      "Transaction reference is required.",
      "reference",
    );
  }

  if (reference.length > 100) {
    throw new PostingError(
      "VALIDATION",
      "Transaction reference must be at most 100 characters.",
      "reference",
    );
  }

  if (!isTransactionType(input.type)) {
    throw new PostingError(
      "VALIDATION",
      "A valid transaction type is required.",
      "type",
    );
  }

  const valueDate = requireDate(input.valueDate, "valueDate");

  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new PostingError(
      "VALIDATION",
      "At least two balanced ledger entries are required.",
      "entries",
    );
  }

  if (input.entries.length < 2) {
    throw new PostingError(
      "VALIDATION",
      "At least two ledger entries are required for double-entry posting.",
      "entries",
    );
  }

  const customerId =
    typeof input.customerId === "string" && input.customerId.trim() !== ""
      ? input.customerId.trim()
      : null;

  const walkInName =
    typeof input.walkInName === "string" && input.walkInName.trim() !== ""
      ? input.walkInName.trim()
      : null;

  const walkInPhone =
    typeof input.walkInPhone === "string" && input.walkInPhone.trim() !== ""
      ? input.walkInPhone.trim()
      : null;

  const description =
    typeof input.description === "string" && input.description.trim() !== ""
      ? input.description.trim()
      : null;

  const createdById =
    typeof input.createdById === "string" && input.createdById.trim() !== ""
      ? input.createdById.trim()
      : null;

  const entries: PostingLineInput[] = [];
  const domainEntries: LedgerEntryInput[] = [];

  for (const [index, entry] of input.entries.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new PostingError(
        "VALIDATION",
        `Ledger entry at index ${index} is invalid.`,
        "entries",
      );
    }

    let currencyCode: CurrencyCode;
    try {
      currencyCode = toCurrencyCode(String(entry.currency));
    } catch {
      throw new PostingError(
        "VALIDATION",
        `Ledger entry at index ${index} has an invalid currency code.`,
        "entries",
      );
    }

    const exchangeRateId =
      typeof entry.exchangeRateId === "string" &&
      entry.exchangeRateId.trim() !== ""
        ? entry.exchangeRateId.trim()
        : null;

    const domainEntry: LedgerEntryInput = {
      walletId: String(entry.walletId ?? "").trim(),
      currency: currencyCode,
      direction: entry.direction,
      amount: entry.amount,
      ...(entry.memo?.trim() ? { memo: entry.memo.trim() } : {}),
    };

    entries.push({
      ...domainEntry,
      exchangeRateId,
    });
    domainEntries.push(domainEntry);
  }

  try {
    validateLedgerEntries(domainEntries);
    assertLedgerBalanced(domainEntries);
  } catch (error) {
    if (isLedgerDomainError(error)) {
      if (error.code === "UNBALANCED_LEDGER") {
        throw new PostingError("UNBALANCED", error.message, "entries");
      }

      throw new PostingError("VALIDATION", error.message, "entries");
    }

    throw error;
  }

  return {
    reference,
    type: input.type,
    valueDate,
    customerId,
    walkInName,
    walkInPhone,
    description,
    createdById,
    entries,
    domainEntries,
  };
}
