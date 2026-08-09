import type { CurrencyCode } from "@/features/ledger/domain/currency";
import { LedgerDomainError } from "@/features/ledger/domain/errors";
import type {
  CurrencyBalance,
  LedgerDirection,
  LedgerEntryInput,
} from "@/features/ledger/domain/ledger-types";
import {
  createMoney,
  isPositiveMoney,
  isZeroMoney,
  type Money,
} from "@/features/ledger/domain/money";

const LEDGER_DIRECTIONS: readonly LedgerDirection[] = ["DEBIT", "CREDIT"];

export function isLedgerDirection(value: string): value is LedgerDirection {
  return (LEDGER_DIRECTIONS as readonly string[]).includes(value);
}

export function assertPositiveLedgerAmount(amount: Money): void {
  if (!isPositiveMoney(amount)) {
    throw new LedgerDomainError(
      "INVALID_LEDGER_ENTRY",
      "Ledger entry amount must be greater than zero.",
    );
  }
}

export function assertLedgerEntryCurrencyConsistency(
  entry: LedgerEntryInput,
): void {
  if (entry.amount.currency !== entry.currency) {
    throw new LedgerDomainError(
      "CURRENCY_MISMATCH",
      "Ledger entry currency must match the money currency.",
    );
  }
}

export function validateLedgerEntry(entry: LedgerEntryInput): void {
  if (!entry.walletId.trim()) {
    throw new LedgerDomainError(
      "INVALID_LEDGER_ENTRY",
      "Ledger entry walletId is required.",
    );
  }

  if (!isLedgerDirection(entry.direction)) {
    throw new LedgerDomainError(
      "INVALID_LEDGER_ENTRY",
      `Invalid ledger direction: "${String(entry.direction)}".`,
    );
  }

  assertPositiveLedgerAmount(entry.amount);
  assertLedgerEntryCurrencyConsistency(entry);
}

export function validateLedgerEntries(
  entries: readonly LedgerEntryInput[],
): void {
  if (entries.length === 0) {
    throw new LedgerDomainError(
      "INVALID_LEDGER_ENTRY",
      "At least one ledger entry is required.",
    );
  }

  for (const entry of entries) {
    validateLedgerEntry(entry);
  }
}

/**
 * Sum debits and credits per currency. A set is balanced when every currency nets to zero.
 */
export function summarizeByCurrency(
  entries: readonly LedgerEntryInput[],
): CurrencyBalance[] {
  validateLedgerEntries(entries);

  const totals = new Map<
    CurrencyCode,
    { debit: bigint; credit: bigint }
  >();

  for (const entry of entries) {
    const current = totals.get(entry.currency) ?? { debit: BigInt(0), credit: BigInt(0) };

    if (entry.direction === "DEBIT") {
      current.debit += entry.amount.amountMinor;
    } else {
      current.credit += entry.amount.amountMinor;
    }

    totals.set(entry.currency, current);
  }

  return [...totals.entries()].map(([currency, { debit, credit }]) => {
    const debitTotal = createMoney(debit, currency);
    const creditTotal = createMoney(credit, currency);

    return {
      currency,
      debitTotal,
      creditTotal,
      net: createMoney(debit - credit, currency),
    };
  });
}

export function assertLedgerBalanced(
  entries: readonly LedgerEntryInput[],
): void {
  const summary = summarizeByCurrency(entries);
  const unbalanced = summary.filter((item) => !isZeroMoney(item.net));

  if (unbalanced.length > 0) {
    const details = unbalanced
      .map(
        (item) =>
          `${item.currency}: debit=${item.debitTotal.amountMinor} credit=${item.creditTotal.amountMinor}`,
      )
      .join("; ");

    throw new LedgerDomainError(
      "UNBALANCED_LEDGER",
      `Ledger entries are not balanced per currency. ${details}`,
    );
  }
}

export function isLedgerBalanced(entries: readonly LedgerEntryInput[]): boolean {
  try {
    assertLedgerBalanced(entries);
    return true;
  } catch (error) {
    if (error instanceof LedgerDomainError && error.code === "UNBALANCED_LEDGER") {
      return false;
    }

    throw error;
  }
}

export function oppositeDirection(direction: LedgerDirection): LedgerDirection {
  return direction === "DEBIT" ? "CREDIT" : "DEBIT";
}

/** Build a reversing entry (same wallet/currency/amount, opposite direction). */
export function createReversalEntry(
  entry: LedgerEntryInput,
  memo = "Reversal",
): LedgerEntryInput {
  validateLedgerEntry(entry);

  return {
    walletId: entry.walletId,
    currency: entry.currency,
    direction: oppositeDirection(entry.direction),
    amount: entry.amount,
    memo,
  };
}
