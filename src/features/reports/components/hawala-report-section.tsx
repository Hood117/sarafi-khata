"use client";

import Link from "next/link";

import { ClickableTableRow } from "@/components/clickable-table-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportEmptyState } from "@/features/reports/components/report-empty-state";
import { ReportSection } from "@/features/reports/components/report-section";
import { ReportStatGrid } from "@/features/reports/components/report-stat-grid";
import {
  CountSummaryTable,
  CurrencyTotalTable,
} from "@/features/reports/components/report-summary-tables";
import { ReportViewAllLink } from "@/features/reports/components/report-view-all-link";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { HawalaReportSummary } from "@/features/reports/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type HawalaReportSectionProps = {
  report: HawalaReportSummary;
  filters: ReportsFilters;
  hasActiveFilters: boolean;
};

export function HawalaReportSection({
  report,
  filters,
  hasActiveFilters,
}: HawalaReportSectionProps) {
  const returnTo = buildReportsHref(filters);

  return (
    <ReportSection
      id="hawala-report"
      title="Hawala Report"
      description={`Hawala documents for ${report.periodLabel}. Counts and currency totals are read-only.`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReportViewAllLink
          href={buildReportsHref(filters, "/reports/hawala")}
          label="View all hawala"
        />
      </div>

      <ReportStatGrid
        columns="2"
        stats={[{ label: "Total hawala", value: report.totalCount }]}
      />

      {report.isEmpty ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <ReportEmptyState hasActiveFilters={hasActiveFilters} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CountSummaryTable title="By status" rows={report.byStatus} />
            <CountSummaryTable title="By direction" rows={report.byDirection} />
          </div>

          <CurrencyTotalTable
            title="Totals by currency"
            rows={report.byCurrency}
          />

          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Reference</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="hidden md:table-cell">Corridor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => {
                  const detailHref = hrefWithReturnTo(
                    `/hawala/${row.id}`,
                    returnTo,
                  );

                  return (
                    <ClickableTableRow key={row.id} href={detailHref}>
                      <TableCell className="font-mono text-sm font-semibold">
                        <Link href={detailHref} className="hover:underline">
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{row.direction}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.originDisplay} → {row.destinationDisplay}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                          {row.currencyCode}
                        </span>
                        {row.amountDisplay}
                      </TableCell>
                      <TableCell>{row.statusLabel}</TableCell>
                    </ClickableTableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </ReportSection>
  );
}
