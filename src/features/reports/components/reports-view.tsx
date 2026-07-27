import { Typography } from "@/design-system/typography";
import { CustomerStatementSection } from "@/features/reports/components/customer-statement-section";
import { ExchangeReportSection } from "@/features/reports/components/exchange-report-section";
import { HawalaReportSection } from "@/features/reports/components/hawala-report-section";
import { PeriodActivityReportSection } from "@/features/reports/components/period-activity-report-section";
import { ReportsFiltersForm } from "@/features/reports/components/reports-filters";
import { TransferReportSection } from "@/features/reports/components/transfer-report-section";
import type { ReportsPageData } from "@/features/reports/domain/types";

type ReportsViewProps = {
  data: ReportsPageData;
};

export function ReportsView({ data }: ReportsViewProps) {
  const navItems =
    data.mode === "range"
      ? ([
          ["filtered-activity", "Activity"],
          ["customer-statement", "Customer statement"],
          ["hawala-report", "Hawala"],
          ["exchange-report", "Exchange"],
          ["transfer-report", "Transfers"],
        ] as const)
      : ([
          ["daily-report", "Daily"],
          ["monthly-report", "Monthly"],
          ["customer-statement", "Customer statement"],
          ["hawala-report", "Hawala"],
          ["exchange-report", "Exchange"],
          ["transfer-report", "Transfers"],
        ] as const);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Typography variant="h3" as="h2">
          Reports
        </Typography>
        <Typography variant="muted">
          Read-only operational summaries as of {data.asOfDate}. Export is not
          available yet.
        </Typography>
      </div>

      <ReportsFiltersForm
        key={[
          data.filters.dateFrom,
          data.filters.dateTo,
          data.filters.customerId,
          data.filters.currencyCode,
          data.filters.type,
          data.filters.operatorId,
        ].join("|")}
        filters={data.filters}
        options={data.filterOptions}
      />

      <nav aria-label="Report sections">
        <ul className="flex flex-wrap gap-2 text-sm">
          {navItems.map(([href, label]) => (
            <li key={href}>
              <a
                href={`#${href}`}
                className="bg-muted/60 hover:bg-muted text-foreground inline-flex rounded-lg px-3 py-1.5 transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {data.mode === "range" && data.range ? (
        <PeriodActivityReportSection
          id="filtered-activity"
          report={data.range}
          showCash
          hasActiveFilters={data.hasActiveFilters}
          filters={data.filters}
        />
      ) : (
        <>
          {data.daily ? (
            <PeriodActivityReportSection
              id="daily-report"
              report={data.daily}
              showCash
              hasActiveFilters={data.hasActiveFilters}
              filters={data.filters}
            />
          ) : null}
          {data.monthly ? (
            <PeriodActivityReportSection
              id="monthly-report"
              report={data.monthly}
              hasActiveFilters={data.hasActiveFilters}
              filters={data.filters}
            />
          ) : null}
        </>
      )}

      <CustomerStatementSection
        filters={data.filters}
        statement={data.customerStatement}
        hasActiveFilters={data.hasActiveFilters}
      />
      <HawalaReportSection
        report={data.hawala}
        filters={data.filters}
        hasActiveFilters={data.hasActiveFilters}
      />
      <ExchangeReportSection
        report={data.exchange}
        filters={data.filters}
        hasActiveFilters={data.hasActiveFilters}
      />
      <TransferReportSection
        report={data.transfer}
        filters={data.filters}
        hasActiveFilters={data.hasActiveFilters}
      />
    </div>
  );
}
