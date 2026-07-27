import { Suspense } from "react";

import { HawalaTable } from "@/features/hawala";
import {
  buildReportsHref,
  getReportHawalaDrilldown,
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
  const { context, transfers } = await getReportHawalaDrilldown(filters);
  const returnTo = buildReportsHref(context.filters, "/reports/hawala");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Hawala Report"
      description="Filtered hawala documents. Open a row to view the existing hawala detail."
      empty={transfers.length === 0}
    >
      <HawalaTable
        transfers={transfers}
        hasSearch={false}
        returnTo={returnTo}
      />
    </ReportListDetailLayout>
  );
}

export default async function ReportHawalaPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
