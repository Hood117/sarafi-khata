import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  dayBoundsForDateOnly,
  type DailyBookFilters,
} from "@/features/daily-book/domain/daily-book-filters";
import {
  formatCurrencyLabel,
  formatMoneyWithCurrency,
} from "@/features/transactions/domain/currency-display";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { getTransactionFormOptions } from "@/features/transactions/services/get-transaction-form-options";
import { getTransactionList } from "@/features/transactions/services/list-transactions";

function filterByCurrency(
  transactions: TransactionListItem[],
  currencyCode: string | null,
): TransactionListItem[] {
  if (!currencyCode) {
    return transactions;
  }

  const code = currencyCode.toUpperCase();
  return transactions
    .map((transaction) => {
      const debitTotals = transaction.debitTotals.filter(
        (total) => total.currencyCode === code,
      );
      if (debitTotals.length === 0) {
        return null;
      }

      const only = debitTotals[0]!;
      return {
        ...transaction,
        debitTotals,
        currencyDisplay: formatCurrencyLabel({
          code: only.currencyCode,
          symbol: only.currencySymbol,
        }),
        amountDisplay: formatMoneyWithCurrency({
          code: only.currencyCode,
          symbol: only.currencySymbol,
          amountDisplay: only.amountDisplay,
        }),
      } satisfies TransactionListItem;
    })
    .filter((row): row is TransactionListItem => row !== null);
}

export async function getDailyBookPageData(filters: DailyBookFilters) {
  await requirePermission("transactions.manage");

  const { start, end } = dayBoundsForDateOnly(filters.date);

  const [transactions, formOptions] = await Promise.all([
    getTransactionList({
      status: "POSTED",
      type: filters.type ?? undefined,
      customerId: filters.customerId ?? undefined,
      valueDateFrom: start,
      valueDateTo: end,
    }),
    getTransactionFormOptions(),
  ]);

  return {
    transactions: filterByCurrency(transactions, filters.currencyCode),
    customers: formOptions.customers,
    currencies: formOptions.currencies,
  };
}
