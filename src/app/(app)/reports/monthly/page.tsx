import { Suspense } from "react";

import {
  getReportsPageData,
  matchesReportSearch,
  parseReportsFiltersFromSearchParams,
  PeriodActivityReportSection,
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
  const data = await getReportsPageData({ filters });

  const reports =
    data.mode === "range" && data.range
      ? [data.range]
      : [data.daily, data.monthly].filter(Boolean);

  const primary = reports[0];
  const periodLabel = primary?.periodLabel ?? "—";
  const transactions = (primary?.recentTransactions ?? []).filter((row) =>
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
    <ReportListDetailLayout
      filters={data.filters}
      periodLabel={periodLabel}
      title="Monthly Report"
      description="Posted activity summary with business cash snapshot. Use dates and search to narrow results."
      empty={reports.length === 0}
      pathname="/reports/monthly"
      exportFilename="monthly-report"
      exportColumns={[
        { key: "valueDate", header: "Date" },
        { key: "type", header: "Type" },
        { key: "reference", header: "Reference" },
        { key: "customer", header: "Customer" },
        { key: "amount", header: "Amount" },
        { key: "operator", header: "Operator" },
      ]}
      exportRows={transactions.map((row) => ({
        valueDate: row.valueDate,
        type: row.type,
        reference: row.reference,
        customer: row.customerName ?? "",
        amount: `${row.currencyDisplay} ${row.amountDisplay}`.trim(),
        operator: row.operatorName ?? "",
      }))}
    >
      <div className="space-y-4">
        {data.mode === "range" && data.range ? (
          <PeriodActivityReportSection
            id="filtered-activity"
            report={{
              ...data.range,
              recentTransactions: transactions,
              isEmpty: transactions.length === 0,
            }}
            showCash
            hasActiveFilters={data.hasActiveFilters}
            filters={data.filters}
          />
        ) : (
          <>
            {data.daily ? (
              <PeriodActivityReportSection
                id="daily-report"
                report={{
                  ...data.daily,
                  recentTransactions: data.daily.recentTransactions.filter(
                    (row) =>
                      matchesReportSearch(
                        filters.search,
                        row.reference,
                        row.type,
                        row.customerName,
                        row.currencyDisplay,
                        row.amountDisplay,
                        row.operatorName,
                      ),
                  ),
                }}
                showCash
                hasActiveFilters={data.hasActiveFilters}
                filters={data.filters}
              />
            ) : null}
            {data.monthly ? (
              <PeriodActivityReportSection
                id="monthly-report"
                report={{
                  ...data.monthly,
                  recentTransactions: data.monthly.recentTransactions.filter(
                    (row) =>
                      matchesReportSearch(
                        filters.search,
                        row.reference,
                        row.type,
                        row.customerName,
                        row.currencyDisplay,
                        row.amountDisplay,
                        row.operatorName,
                      ),
                  ),
                }}
                hasActiveFilters={data.hasActiveFilters}
                filters={data.filters}
              />
            ) : null}
          </>
        )}
      </div>
    </ReportListDetailLayout>
  );
}

export default async function ReportMonthlyPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense key={JSON.stringify(params)} fallback={<ReportsSkeleton />}>
      <Content searchParams={params} />
    </Suspense>
  );
}
