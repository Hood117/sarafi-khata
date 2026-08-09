import { Suspense } from "react";

import {
  getReportTransactionDrilldown,
  matchesReportSearch,
  parseReportsFiltersFromSearchParams,
  ReportTransactionsDetailView,
  ReportsSkeleton,
} from "@/features/reports";

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

async function Content({
  searchParams,
}: {
  searchParams: Awaited<PageProps["searchParams"]>;
}) {
  const filters = parseReportsFiltersFromSearchParams(searchParams);
  const { context, transactions } =
    await getReportTransactionDrilldown(filters);

  const filtered = transactions.filter((row) =>
    matchesReportSearch(
      filters.search,
      row.reference,
      row.type,
      row.customerName,
      row.currencyDisplay,
      row.amountDisplay,
      row.operatorName,
    ),
  );

  return (
    <ReportTransactionsDetailView
      filters={context.filters}
      periodLabel={context.period.label}
      transactions={filtered}
    />
  );
}

export default async function ReportTransactionsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
