import { Suspense } from "react";

import {
  buildReportsHref,
  getReportTransferDrilldown,
  matchesReportSearch,
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
    q?: string | string[];
  }>;
};

async function Content({
  searchParams,
}: {
  searchParams: Awaited<PageProps["searchParams"]>;
}) {
  const filters = parseReportsFiltersFromSearchParams(searchParams);
  const { context, transfers } = await getReportTransferDrilldown(filters);
  const filtered = transfers.filter((row) =>
    matchesReportSearch(
      filters.search,
      row.reference,
      row.senderName,
      row.receiverName,
      row.currencyCode,
      row.amountDisplay,
      row.statusLabel,
      row.operatorName,
    ),
  );
  const returnTo = buildReportsHref(context.filters, "/reports/transfers");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Transfers Report"
      description="Filtered customer transfers. Open a row to view the existing transfer detail."
      empty={filtered.length === 0}
      pathname="/reports/transfers"
      exportFilename="transfers-report"
      exportColumns={[
        { key: "valueDate", header: "Date" },
        { key: "reference", header: "Reference" },
        { key: "sender", header: "Sender" },
        { key: "receiver", header: "Receiver" },
        { key: "currency", header: "Currency" },
        { key: "amount", header: "Amount" },
        { key: "status", header: "Status" },
      ]}
      exportRows={filtered.map((row) => ({
        valueDate: row.valueDate,
        reference: row.reference,
        sender: row.senderName ?? "",
        receiver: row.receiverName ?? "",
        currency: row.currencyCode,
        amount: row.amountDisplay,
        status: row.statusLabel,
      }))}
    >
      <TransferHistoryTable transfers={filtered} returnTo={returnTo} />
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
