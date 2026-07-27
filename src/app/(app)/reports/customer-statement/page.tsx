import Link from "next/link";
import { Suspense } from "react";

import { ClickableTableRow } from "@/components/clickable-table-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import { CustomerBalancesSection } from "@/features/customers";
import {
  getCustomerProfile,
  isCustomerError,
} from "@/features/customers";
import {
  OpenCustomerProfileButton,
  ReportEmptyState,
  ReportListDetailLayout,
  ReportsSkeleton,
  buildReportsHref,
  getReportDrilldownContext,
  hasActiveReportsFilters,
  parseReportsFiltersFromSearchParams,
} from "@/features/reports";
import { getCustomerHistory } from "@/features/transactions";
import { getCustomerCurrencyBalances } from "@/features/wallets";
import { hrefWithReturnTo } from "@/lib/navigation";

type PageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    customerId?: string | string[];
    currency?: string | string[];
    type?: string | string[];
    operator?: string | string[];
  }>;
};

function formatEventDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

async function Content({
  searchParams,
}: {
  searchParams: Awaited<PageProps["searchParams"]>;
}) {
  const filters = parseReportsFiltersFromSearchParams(searchParams);
  const hasFilters = hasActiveReportsFilters(filters);
  const returnTo = buildReportsHref(filters, "/reports/customer-statement");

  if (!filters.customerId) {
    return (
      <ReportListDetailLayout
        filters={filters}
        periodLabel="—"
        title="Customer Statement"
        description="Choose a customer in Reports filters, then open this statement detail."
        empty
      >
        {null}
      </ReportListDetailLayout>
    );
  }

  let profile;
  try {
    profile = await getCustomerProfile(filters.customerId);
  } catch (error) {
    if (isCustomerError(error) && error.code === "NOT_FOUND") {
      return (
        <ReportListDetailLayout
          filters={filters}
          periodLabel="—"
          title="Customer Statement"
          description="The selected customer could not be found."
          empty
        >
          {null}
        </ReportListDetailLayout>
      );
    }
    throw error;
  }

  const context = await getReportDrilldownContext(filters);
  const operatorLabel = context.operatorLabel;
  const operatorFilterActive = Boolean(operatorLabel);

  const [history, balances] = await Promise.all([
    getCustomerHistory(filters.customerId, {
      page: 1,
      pageSize: operatorFilterActive ? 100 : 50,
      sort: "newest",
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
    }),
    getCustomerCurrencyBalances(filters.customerId, {
      includeArchived: true,
    }),
  ]);

  const filteredEvents = operatorLabel
    ? history.events.filter(
        (event) => (event.operatorName ?? "").trim() === operatorLabel,
      )
    : history.events;
  const events = filteredEvents.slice(0, 50);
  const eventTotal = operatorFilterActive
    ? filteredEvents.length
    : history.total;

  const filteredBalances = filters.currencyCode
    ? balances.filter((balance) => balance.currencyCode === filters.currencyCode)
    : balances;

  const periodLabel =
    filters.dateFrom || filters.dateTo
      ? [filters.dateFrom, filters.dateTo].filter(Boolean).join(" → ")
      : "All dates";

  return (
    <ReportListDetailLayout
      filters={filters}
      periodLabel={periodLabel}
      title="Customer Statement"
      description="Balances reuse the customer profile section. History rows open the existing transaction detail; use Open customer profile for the full profile page."
      empty={false}
      actions={
        <OpenCustomerProfileButton
          customerId={filters.customerId}
          filters={filters}
        />
      }
    >
      <div className="space-y-8">
        <div className="space-y-1">
          <Typography variant="h4" className="font-semibold">
            {profile.fullName}
            {profile.code ? ` · ${profile.code}` : ""}
          </Typography>
        </div>

        <CustomerBalancesSection balances={filteredBalances} />

        <section className="space-y-3">
          <Typography variant="h4" className="font-bold">
            History ({eventTotal} events)
          </Typography>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            {events.length === 0 ? (
              <ReportEmptyState hasActiveFilters={hasFilters} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const detailHref = hrefWithReturnTo(
                      `/transactions/${event.transactionId}`,
                      returnTo,
                    );

                    return (
                      <ClickableTableRow key={event.id} href={detailHref}>
                        <TableCell>{formatEventDate(event.date)}</TableCell>
                        <TableCell>{event.typeLabel}</TableCell>
                        <TableCell className="font-mono text-sm">
                          <Link href={detailHref} className="hover:underline">
                            {event.reference}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums font-medium">
                          <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                            {event.currencyCode} · {event.direction}
                          </span>
                          {event.amountDisplay}
                        </TableCell>
                      </ClickableTableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      </div>
    </ReportListDetailLayout>
  );
}

export default async function ReportCustomerStatementPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
