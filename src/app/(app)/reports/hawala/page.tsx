import { Suspense } from "react";

import { HawalaTable } from "@/features/hawala";
import {
  buildReportsHref,
  getReportHawalaDrilldown,
  matchesReportSearch,
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
    q?: string | string[];
  }>;
};

async function Content({
  searchParams,
}: {
  searchParams: Awaited<PageProps["searchParams"]>;
}) {
  const filters = parseReportsFiltersFromSearchParams(searchParams);
  const { context, transfers } = await getReportHawalaDrilldown(filters);
  const filtered = transfers.filter((row) =>
    matchesReportSearch(
      filters.search,
      row.reference,
      row.senderName,
      row.receiverName,
      row.partnerSarafi,
      row.currencyCode,
      row.amountDisplay,
      row.statusLabel,
      row.operatorName,
    ),
  );
  const returnTo = buildReportsHref(context.filters, "/reports/hawala");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Hawala Report"
      description="Filtered hawala documents. Open a row to view the existing hawala detail."
      empty={filtered.length === 0}
      pathname="/reports/hawala"
      exportFilename="hawala-report"
      exportColumns={[
        { key: "valueDate", header: "Date" },
        { key: "reference", header: "Reference" },
        { key: "direction", header: "Direction" },
        { key: "sender", header: "Sender" },
        { key: "receiver", header: "Receiver" },
        { key: "currency", header: "Currency" },
        { key: "amount", header: "Amount" },
        { key: "status", header: "Status" },
      ]}
      exportRows={filtered.map((row) => ({
        valueDate: row.valueDate,
        reference: row.reference,
        direction: row.direction,
        sender: row.senderName,
        receiver: row.receiverName,
        currency: row.currencyCode,
        amount: row.amountDisplay,
        status: row.statusLabel,
      }))}
    >
      <HawalaTable
        transfers={filtered}
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
