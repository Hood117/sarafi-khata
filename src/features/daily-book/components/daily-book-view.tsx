import { Typography } from "@/design-system/typography";
import { DailyBookFiltersForm } from "@/features/daily-book/components/daily-book-filters";
import { DailyBookSummaryCards } from "@/features/daily-book/components/daily-book-summary-cards";
import {
  buildDailyBookHref,
  hasActiveDailyBookFilters,
  type DailyBookCurrencyOption,
  type DailyBookCustomerOption,
  type DailyBookFilters,
} from "@/features/daily-book/domain/daily-book-filters";
import { buildDailyBookSummary } from "@/features/daily-book/domain/daily-book-summary";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import { TransactionsTable } from "@/features/transactions/components/transactions-table";
import type { TransactionListItem } from "@/features/transactions/domain/types";

type DailyBookViewProps = {
  filters: DailyBookFilters;
  customers: DailyBookCustomerOption[];
  currencies: DailyBookCurrencyOption[];
  transactions: TransactionListItem[];
};

function formatBookDate(dateOnly: string): string {
  const parsed = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateOnly;
  }

  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export function DailyBookView({
  filters,
  customers,
  currencies,
  transactions,
}: DailyBookViewProps) {
  const filterKey = [
    filters.date,
    filters.type ?? "",
    filters.customerId ?? "",
    filters.currencyCode ?? "",
  ].join("|");
  const dateLabel = formatBookDate(filters.date);
  const summary = buildDailyBookSummary(transactions);
  const currencyFilterLabel = filters.currencyCode
    ? formatCurrencyLabel({
        code: filters.currencyCode,
        symbol:
          currencies.find((currency) => currency.code === filters.currencyCode)
            ?.symbol ?? null,
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Typography variant="h3" as="h2">
          Daily Book
        </Typography>
        <Typography variant="muted">
          Posted movements for {dateLabel}
          {currencyFilterLabel ? ` in ${currencyFilterLabel}` : ""}
          {hasActiveDailyBookFilters(filters) ? " (filtered)" : ""}.
        </Typography>
      </div>

      <DailyBookFiltersForm
        key={filterKey}
        filters={filters}
        customers={customers}
        currencies={currencies}
      />

      <DailyBookSummaryCards
        summary={summary}
        dateLabel={dateLabel}
        currencyFilterLabel={currencyFilterLabel}
      />

      <section aria-labelledby="daily-book-history-heading" className="space-y-2">
        <div className="space-y-1">
          <Typography variant="h4" as="h3" id="daily-book-history-heading">
            History
          </Typography>
          <Typography variant="muted">
            Every posted movement for this day, with type and currency symbol.
          </Typography>
        </div>

        <TransactionsTable
          transactions={transactions}
          returnTo={buildDailyBookHref(filters)}
          emphasizeType
        />
      </section>
    </div>
  );
}
