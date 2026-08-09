import Link from "next/link";
import { useT } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import { Typography } from "@/design-system/typography";
import { CustomerHistoryEmptyState } from "@/features/customers/components/customer-history-empty-state";
import { CustomerHistoryFiltersForm } from "@/features/customers/components/customer-history-filters";
import {
  buildCustomerHistoryHrefFromFilters,
  buildTransactionDetailHrefFromHistory,
} from "@/features/customers/domain/customer-history-url";
import type {
  CustomerHistoryEvent,
  CustomerHistoryFilters,
  CustomerHistoryResult,
} from "@/features/transactions";
import { cn } from "@/lib/utils";

type CustomerHistorySectionProps = {
  customerId: string;
  history: CustomerHistoryResult;
};

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

function hasActiveFilters(filters: CustomerHistoryFilters): boolean {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.type ||
      filters.currencyCode ||
      filters.reference,
  );
}

function DirectionBadge({
  direction,
}: {
  direction: CustomerHistoryEvent["direction"];
}) {
  const isCredit = direction === "CREDIT";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        isCredit
          ? "bg-muted text-muted-foreground"
          : "bg-foreground/10 text-foreground",
      )}
    >
      {isCredit ? "Credit" : "Debit"}
    </span>
  );
}

function HistoryEventItem({
  event,
  isLast,
  href,
}: {
  event: CustomerHistoryEvent;
  isLast: boolean;
  href: string;
}) {
  return (
    <li className="relative flex gap-4">
      <div className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
        <span className="bg-foreground/35 ring-background mt-1.5 size-2.5 shrink-0 rounded-full ring-4" />
        {isLast ? null : (
          <span className="bg-foreground/10 mt-1 w-px flex-1" />
        )}
      </div>

      <Link
        href={href}
        className={cn(
          "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 -mt-1 min-w-0 flex-1 rounded-lg px-3 py-3 transition-colors outline-none focus-visible:ring-3",
          !isLast && "mb-1",
        )}
        aria-label={`${event.typeLabel}, ${event.amountDisplay} ${event.currencyCode}, ${formatDate(event.date)}, reference ${event.reference}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <Typography variant="caption" as="span" className="block">
              {formatDate(event.date)}
            </Typography>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Typography variant="bodySm" className="font-medium" as="span">
                {event.typeLabel}
              </Typography>
              <Typography variant="bodySm" className="tabular-nums" as="span">
                {event.amountDisplay} {event.currencyCode}
              </Typography>
            </div>
            <Typography
              variant="muted"
              className="block font-mono text-xs break-all"
              as="span"
            >
              {event.reference}
            </Typography>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DirectionBadge direction={event.direction} />
            <StatusBadge
              label={event.statusLabel}
              tone={toneForRecordStatus(event.status)}
            />
          </div>
        </div>
      </Link>
    </li>
  );
}

export function CustomerHistorySection({
  customerId,
  history,
}: CustomerHistorySectionProps) {
  const t = useT();
  const { events, total, page, pageSize, filters, sort, currencyOptions } =
    history;
  const showing = events.length;
  const filtersActive = hasActiveFilters(filters);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const returnTo = buildCustomerHistoryHrefFromFilters(
    customerId,
    filters,
    sort,
    page,
  );
  const previousHref = buildCustomerHistoryHrefFromFilters(
    customerId,
    filters,
    sort,
    page - 1,
  );
  const nextHref = buildCustomerHistoryHrefFromFilters(
    customerId,
    filters,
    sort,
    page + 1,
  );

  return (
    <section
      className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1"
      aria-labelledby="customer-history-heading"
    >
      <Typography
        variant="h4"
        id="customer-history-heading"
        className="font-bold"
      >
        Customer History
      </Typography>

      <CustomerHistoryFiltersForm
        key={[
          filters.dateFrom ?? "",
          filters.dateTo ?? "",
          filters.type ?? "",
          filters.currencyCode ?? "",
          filters.reference ?? "",
          sort,
        ].join("|")}
        customerId={customerId}
        filters={filters}
        sort={sort}
        currencyOptions={currencyOptions}
      />

      <div className="rounded-xl ring-1 ring-foreground/10">
        {showing === 0 ? (
          <CustomerHistoryEmptyState hasActiveFilters={filtersActive} />
        ) : (
          <ol className="px-3 py-3 sm:px-5" aria-label={t.customers.customerHistory}>
            {events.map((event, index) => (
              <HistoryEventItem
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
                href={buildTransactionDetailHrefFromHistory(
                  event.transactionId,
                  returnTo,
                )}
              />
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography variant="muted">
          {total === 0
            ? filtersActive
              ? t.customers.noHistoryFiltered
              : t.customers.noHistory
            : showing === total
              ? `Showing ${total} event${total === 1 ? "" : "s"}`
              : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + showing} of ${total} events`}
        </Typography>

        <nav className="flex items-center gap-2" aria-label={t.customers.customerHistory}>
          {hasPrevious ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={previousHref} />}
              aria-label={t.common.previous}
            >
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label={t.common.previous}>
              Previous
            </Button>
          )}
          {hasNext ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={nextHref} />}
              aria-label={t.common.next}
            >
              Next
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label={t.common.next}>
              Next
            </Button>
          )}
        </nav>
      </div>
    </section>
  );
}
