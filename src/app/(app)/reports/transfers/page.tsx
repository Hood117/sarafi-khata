import { Suspense } from "react";

import {
  buildReportsHref,
  getReportTransferDrilldown,
  parseReportsFiltersFromSearchParams,
  ReportListDetailLayout,
  ReportsSkeleton,
} from "@/features/reports";
import { TransferHistoryTable } from "@/features/transfers";

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
  const { context, transfers } = await getReportTransferDrilldown(filters);
  const returnTo = buildReportsHref(context.filters, "/reports/transfers");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Customer Transfer Report"
      description="Filtered customer transfers. Open a row to view the existing transfer detail."
      empty={transfers.length === 0}
    >
      <TransferHistoryTable transfers={transfers} returnTo={returnTo} />
    </ReportListDetailLayout>
  );
}

export default async function ReportTransfersPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
