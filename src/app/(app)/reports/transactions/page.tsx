import { Suspense } from "react";

import {
  getReportTransactionDrilldown,
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

  return (
    <ReportTransactionsDetailView
      filters={context.filters}
      periodLabel={context.period.label}
      transactions={transactions}
    />
  );
}

export default async function ReportTransactionsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const key = JSON.stringify(params);

  return (
    <Suspense key={key} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
