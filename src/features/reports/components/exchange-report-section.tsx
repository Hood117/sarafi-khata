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
import { CountSummaryTable } from "@/features/reports/components/report-summary-tables";
import { ReportViewAllLink } from "@/features/reports/components/report-view-all-link";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { ExchangeReportSummary } from "@/features/reports/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type ExchangeReportSectionProps = {
  report: ExchangeReportSummary;
  filters: ReportsFilters;
  hasActiveFilters: boolean;
};

export function ExchangeReportSection({
  report,
  filters,
  hasActiveFilters,
}: ExchangeReportSectionProps) {
  const returnTo = buildReportsHref(filters);

  return (
    <ReportSection
      id="exchange-report"
      title="Currency Exchange Report"
      description={`Posted FX deals for ${report.periodLabel}. Pair counts from exchange history.`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReportViewAllLink
          href={buildReportsHref(filters, "/reports/exchange")}
          label="View all exchanges"
        />
      </div>

      <ReportStatGrid
        columns="2"
        stats={[{ label: "Total exchanges", value: report.totalCount }]}
      />

      {report.isEmpty ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <ReportEmptyState hasActiveFilters={hasActiveFilters} />
        </div>
      ) : (
        <>
          <CountSummaryTable title="By currency pair" rows={report.byPair} />

          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Converted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => {
                  const detailHref = hrefWithReturnTo(
                    `/exchange/${row.id}`,
                    returnTo,
                  );

                  return (
                    <ClickableTableRow key={row.id} href={detailHref}>
                      <TableCell className="font-mono text-sm font-semibold">
                        <Link href={detailHref} className="hover:underline">
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{row.customerName ?? "—"}</TableCell>
                      <TableCell>
                        {row.fromCurrencyCode} → {row.toCurrencyCode}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {row.amountDisplay}
                      </TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">
                        {row.convertedAmountDisplay}
                      </TableCell>
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
