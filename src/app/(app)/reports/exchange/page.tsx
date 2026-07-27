import { Suspense } from "react";

import { ExchangeHistoryTable } from "@/features/exchange";
import {
  buildReportsHref,
  getReportExchangeDrilldown,
  parseReportsFiltersFromSearchParams,
  ReportListDetailLayout,
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
  const { context, exchanges } = await getReportExchangeDrilldown(filters);
  const returnTo = buildReportsHref(context.filters, "/reports/exchange");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Currency Exchange Report"
      description="Filtered FX deals. Open a row to view the existing exchange detail."
      empty={exchanges.length === 0}
    >
      <ExchangeHistoryTable exchanges={exchanges} returnTo={returnTo} />
    </ReportListDetailLayout>
  );
}

export default async function ReportExchangePage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
