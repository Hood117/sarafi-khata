import { formatMinorUnits } from "@/features/transactions/services/ledger-amount-display";
import {
  formatCurrencyLabel,
  formatMoneyWithCurrency,
} from "@/features/transactions/domain/currency-display";
import type { TransactionListItem } from "@/features/transactions/domain/types";

export type DailyBookCurrencyTotal = {
  currencyCode: string;
  currencySymbol: string | null;
  currencyLabel: string;
  amountDisplay: string;
  amountFormatted: string;
};

export type DailyBookOperationCard = {
  key: string;
  label: string;
  count: number;
  totals: DailyBookCurrencyTotal[];
};

export type DailyBookSummary = {
  totalCount: number;
  operations: DailyBookOperationCard[];
  grandTotals: DailyBookCurrencyTotal[];
};

const OPERATION_ORDER = [
  "Sent Hawala",
  "Received Hawala",
  "Hawala",
  "Exchange",
  "Transfer",
  "Deposit",
  "Withdrawal",
  "External money",
  "Added to wallet",
  "Adjustment",
] as const;

type MutableCurrencyTotal = {
  currencyCode: string;
  currencySymbol: string | null;
  minor: bigint;
  decimalPlaces: number;
};

function addCurrencyTotal(
  map: Map<string, MutableCurrencyTotal>,
  total: {
    currencyCode: string;
    currencySymbol: string | null;
    amountMinor: string;
    decimalPlaces: number;
  },
) {
  let minor = BigInt(0);
  try {
    minor = BigInt(total.amountMinor);
  } catch {
    return;
  }

  const current = map.get(total.currencyCode) ?? {
    currencyCode: total.currencyCode,
    currencySymbol: total.currencySymbol,
    minor: BigInt(0),
    decimalPlaces: total.decimalPlaces,
  };
  current.minor += minor;
  current.currencySymbol = total.currencySymbol;
  current.decimalPlaces = total.decimalPlaces;
  map.set(total.currencyCode, current);
}

function finalizeCurrencyTotals(
  map: Map<string, MutableCurrencyTotal>,
): DailyBookCurrencyTotal[] {
  return [...map.values()]
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
    .map((total) => {
      const amountDisplay = formatMinorUnits(total.minor, total.decimalPlaces);
      return {
        currencyCode: total.currencyCode,
        currencySymbol: total.currencySymbol,
        currencyLabel: formatCurrencyLabel({
          code: total.currencyCode,
          symbol: total.currencySymbol,
        }),
        amountDisplay,
        amountFormatted: formatMoneyWithCurrency({
          code: total.currencyCode,
          symbol: total.currencySymbol,
          amountDisplay,
        }),
      };
    });
}

/**
 * Aggregate day-book cards from the filtered transaction history rows.
 * Only includes operation types that happened that day, with money sums by currency.
 */
export function buildDailyBookSummary(
  transactions: readonly TransactionListItem[],
): DailyBookSummary {
  const byOperation = new Map<
    string,
    { count: number; currencies: Map<string, MutableCurrencyTotal> }
  >();
  const grand = new Map<string, MutableCurrencyTotal>();

  for (const transaction of transactions) {
    const label = transaction.typeLabel || transaction.type;
    const bucket = byOperation.get(label) ?? {
      count: 0,
      currencies: new Map<string, MutableCurrencyTotal>(),
    };
    bucket.count += 1;

    for (const total of transaction.debitTotals) {
      addCurrencyTotal(bucket.currencies, total);
      addCurrencyTotal(grand, total);
    }

    byOperation.set(label, bucket);
  }

  const operations: DailyBookOperationCard[] = [];
  const seen = new Set<string>();

  for (const label of OPERATION_ORDER) {
    const bucket = byOperation.get(label);
    if (!bucket || bucket.count === 0) {
      continue;
    }
    operations.push({
      key: label,
      label,
      count: bucket.count,
      totals: finalizeCurrencyTotals(bucket.currencies),
    });
    seen.add(label);
  }

  for (const [label, bucket] of byOperation) {
    if (seen.has(label) || bucket.count === 0) {
      continue;
    }
    operations.push({
      key: label,
      label,
      count: bucket.count,
      totals: finalizeCurrencyTotals(bucket.currencies),
    });
  }

  return {
    totalCount: transactions.length,
    operations,
    grandTotals: finalizeCurrencyTotals(grand),
  };
}
