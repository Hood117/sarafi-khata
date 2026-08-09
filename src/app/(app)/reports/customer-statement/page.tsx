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
import {
  CustomerBalancesSection,
  formatCustomerLabel,
  getCustomerList,
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
  matchesReportSearch,
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
    q?: string | string[];
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
  const customers = await getCustomerList({ archiveFilter: "active" });
  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    label: formatCustomerLabel(customer.fullName, customer.code),
  }));

  if (!filters.customerId) {
    return (
      <ReportListDetailLayout
        filters={filters}
        periodLabel="—"
        title="Customer Statement"
        description="Select a customer, then apply date filters to view their statement."
        empty
        pathname="/reports/customer-statement"
        showCustomerFilter
        customerOptions={customerOptions}
        exportFilename="customer-statement"
        exportColumns={[
          { key: "date", header: "Date" },
          { key: "type", header: "Type" },
          { key: "reference", header: "Reference" },
          { key: "amount", header: "Amount" },
        ]}
        exportRows={[]}
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
          pathname="/reports/customer-statement"
          showCustomerFilter
          customerOptions={customerOptions}
          exportFilename="customer-statement"
          exportColumns={[
            { key: "date", header: "Date" },
            { key: "type", header: "Type" },
            { key: "reference", header: "Reference" },
            { key: "amount", header: "Amount" },
          ]}
          exportRows={[]}
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

  const filteredEvents = (
    operatorLabel
      ? history.events.filter(
          (event) => (event.operatorName ?? "").trim() === operatorLabel,
        )
      : history.events
  ).filter((event) =>
    matchesReportSearch(
      filters.search,
      event.reference,
      event.typeLabel,
      event.currencyCode,
      event.amountDisplay,
      event.direction,
      event.operatorName,
    ),
  );
  const events = filteredEvents.slice(0, 50);
  const eventTotal = filteredEvents.length;

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
      description="Balances and history for the selected customer. Print or export the filtered rows."
      empty={false}
      pathname="/reports/customer-statement"
      showCustomerFilter
      customerOptions={customerOptions}
      exportFilename={`customer-statement-${profile.code ?? profile.id}`}
      exportColumns={[
        { key: "date", header: "Date" },
        { key: "type", header: "Type" },
        { key: "reference", header: "Reference" },
        { key: "direction", header: "Direction" },
        { key: "currency", header: "Currency" },
        { key: "amount", header: "Amount" },
      ]}
      exportRows={events.map((event) => ({
        date: formatEventDate(event.date),
        type: event.typeLabel,
        reference: event.reference,
        direction: event.direction,
        currency: event.currencyCode,
        amount: event.amountDisplay,
      }))}
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
