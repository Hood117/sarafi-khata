/**
 * Sarafi Credit/Debit columns vs ledger directions.
 *
 * Used by customer history and the daybook journal (same Sarafi labels:
 * EN Credit / PS جمع, EN Debit / PS بقایه).
 *
 * Storage (asset convention on wallet lines the UI surfaces):
 * - Ledger DEBIT  → balance ↑ (deposit / money added)
 * - Ledger CREDIT → balance ↓ (withdrawal / money removed)
 * - balance_after = balance_before + ledgerDebit − ledgerCredit
 *
 * Sarafi columns:
 * - Credit / جمع = money added
 * - Debit        = money removed
 * - balance_after = balance_before + credit − debit
 *
 * Those two formulas are equivalent when:
 *   statement.credit = ledger.debit
 *   statement.debit  = ledger.credit
 *
 * Do not classify by English/Pashto description text — callers must pass
 * structured ledger debit/credit amounts.
 */

export type LedgerDebitCredit = {
  /** Asset-convention DEBIT amount on the customer wallet (empty when none). */
  debit?: string | null;
  /** Asset-convention CREDIT amount on the customer wallet (empty when none). */
  credit?: string | null;
};

export type CustomerStatementAmounts = {
  /** Statement Credit / جمع (money added). */
  credit: string;
  /** Statement Debit (money removed). */
  debit: string;
};

function cell(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Map asset-convention ledger amounts to Sarafi Credit/Debit cells. */
export function toCustomerStatementAmounts(
  row: LedgerDebitCredit,
): CustomerStatementAmounts {
  return {
    credit: cell(row.debit),
    debit: cell(row.credit),
  };
}

/** Same mapping for daybook journal Credit/Debit columns. */
export const toSarafiJournalAmounts = toCustomerStatementAmounts;

export type StatementTone = "in" | "out" | null;

/** Green credit / red debit cell tones for non-empty statement amounts. */
export function customerStatementAmountTones(
  amounts: CustomerStatementAmounts,
): { creditTone: StatementTone; debitTone: StatementTone } {
  return {
    creditTone: amounts.credit ? "in" : null,
    debitTone: amounts.debit ? "out" : null,
  };
}

/**
 * Apply one statement line to a running balance (AFTER-transaction).
 * Uses customer-facing credit/debit: balance' = balance + credit − debit.
 */
export function applyCustomerStatementBalance(
  balanceBefore: number,
  amounts: CustomerStatementAmounts,
): number {
  const credit = amounts.credit ? Number(amounts.credit.replace(/,/g, "")) : 0;
  const debit = amounts.debit ? Number(amounts.debit.replace(/,/g, "")) : 0;
  const c = Number.isFinite(credit) ? credit : 0;
  const d = Number.isFinite(debit) ? debit : 0;
  return balanceBefore + c - d;
}

/**
 * Compute AFTER-transaction running balances in chronological order, then
 * optionally reverse for newest-first presentation (balances stay attached).
 */
export function withRunningBalances<T extends LedgerDebitCredit>(
  chronologicalAsc: T[],
  options?: { newestFirst?: boolean },
): Array<T & { balanceAfter: number; statement: CustomerStatementAmounts }> {
  let balance = 0;
  const withBalances = chronologicalAsc.map((row) => {
    const statement = toCustomerStatementAmounts(row);
    balance = applyCustomerStatementBalance(balance, statement);
    return { ...row, balanceAfter: balance, statement };
  });
  if (options?.newestFirst) {
    return [...withBalances].reverse();
  }
  return withBalances;
}
