import { Suspense } from "react";

import { ExchangeHistoryTable } from "@/features/exchange";
import {
  buildReportsHref,
  getReportExchangeDrilldown,
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
  const { context, exchanges } = await getReportExchangeDrilldown(filters);
  const filtered = exchanges.filter((row) =>
    matchesReportSearch(
      filters.search,
      row.reference,
      row.customerName,
      row.fromCurrencyCode,
      row.toCurrencyCode,
      row.amountDisplay,
      row.convertedAmountDisplay,
      row.operatorName,
    ),
  );
  const returnTo = buildReportsHref(context.filters, "/reports/exchange");

  return (
    <ReportListDetailLayout
      filters={context.filters}
      periodLabel={context.period.label}
      title="Exchange Report"
      description="Filtered FX deals. Open a row to view the existing exchange detail."
      empty={filtered.length === 0}
      pathname="/reports/exchange"
      exportFilename="exchange-report"
      exportColumns={[
        { key: "valueDate", header: "Date" },
        { key: "reference", header: "Reference" },
        { key: "customer", header: "Customer" },
        { key: "from", header: "From" },
        { key: "to", header: "To" },
        { key: "amount", header: "Amount" },
        { key: "converted", header: "Converted" },
        { key: "rate", header: "Rate" },
      ]}
      exportRows={filtered.map((row) => ({
        valueDate: row.valueDate,
        reference: row.reference,
        customer: row.customerName ?? "",
        from: row.fromCurrencyCode,
        to: row.toCurrencyCode,
        amount: row.amountDisplay,
        converted: row.convertedAmountDisplay,
        rate: row.exchangeRateDisplay,
      }))}
    >
      <ExchangeHistoryTable exchanges={filtered} returnTo={returnTo} />
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
