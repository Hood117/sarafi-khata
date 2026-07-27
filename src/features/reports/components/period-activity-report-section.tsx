import { Typography } from "@/design-system/typography";
import { PeriodTransactionsTable } from "@/features/reports/components/period-transactions-table";
import { ReportEmptyState } from "@/features/reports/components/report-empty-state";
import { ReportSection } from "@/features/reports/components/report-section";
import { ReportStatGrid } from "@/features/reports/components/report-stat-grid";
import {
  ReportViewAllLink,
  buildPeriodTransactionsDrilldownHref,
} from "@/features/reports/components/report-view-all-link";
import type { ReportsFilters } from "@/features/reports/domain/reports-filters";
import type { PeriodActivityReport } from "@/features/reports/domain/types";

type PeriodActivityReportSectionProps = {
  id: string;
  report: PeriodActivityReport;
  showCash?: boolean;
  hasActiveFilters?: boolean;
  filters: ReportsFilters;
};

export function PeriodActivityReportSection({
  id,
  report,
  showCash = false,
  hasActiveFilters = false,
  filters,
}: PeriodActivityReportSectionProps) {
  const { counts } = report;
  const viewAllHref = buildPeriodTransactionsDrilldownHref(filters, report);

  return (
    <ReportSection
      id={id}
      title={report.title}
      description={`Posted activity for ${report.periodLabel}. Read-only totals from the ledger.`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReportViewAllLink href={viewAllHref} label="View transactions" />
      </div>

      <ReportStatGrid
        stats={[
          { label: "Transactions", value: counts.transactions },
          { label: "Deposits", value: counts.deposits },
          { label: "Withdrawals", value: counts.withdrawals },
          { label: "Exchanges", value: counts.exchanges },
          { label: "Hawala", value: counts.hawala },
          { label: "Transfers", value: counts.transfers },
          { label: "Adjustments", value: counts.adjustments },
        ]}
        columns="4"
      />

      {showCash ? (
        <div className="space-y-2">
          <Typography variant="bodySm" className="font-semibold">
            Business cash (current)
          </Typography>
          {report.businessCash.length === 0 ? (
            <Typography variant="muted">
              No currencies configured yet.
            </Typography>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.businessCash.map((balance) => (
                <div
                  key={balance.currencyCode}
                  className="ring-foreground/10 space-y-1 rounded-xl px-4 py-3 ring-1"
                >
                  <Typography variant="overline" as="dt">
                    {balance.currencyCode}
                  </Typography>
                  <Typography
                    variant="h4"
                    as="dd"
                    className="tabular-nums tracking-tight"
                  >
                    {balance.balanceDisplay}
                  </Typography>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}

      {report.isEmpty ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <ReportEmptyState hasActiveFilters={hasActiveFilters} />
        </div>
      ) : (
        <PeriodTransactionsTable
          transactions={report.recentTransactions}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
        />
      )}
    </ReportSection>
  );
}
