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
import { CurrencyTotalTable } from "@/features/reports/components/report-summary-tables";
import { ReportViewAllLink } from "@/features/reports/components/report-view-all-link";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { TransferReportSummary } from "@/features/reports/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type TransferReportSectionProps = {
  report: TransferReportSummary;
  filters: ReportsFilters;
  hasActiveFilters: boolean;
};

export function TransferReportSection({
  report,
  filters,
  hasActiveFilters,
}: TransferReportSectionProps) {
  const returnTo = buildReportsHref(filters);

  return (
    <ReportSection
      id="transfer-report"
      title="Customer Transfer Report"
      description={`Posted customer-to-customer transfers for ${report.periodLabel}.`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReportViewAllLink
          href={buildReportsHref(filters, "/reports/transfers")}
          label="View all transfers"
        />
      </div>

      <ReportStatGrid
        columns="2"
        stats={[{ label: "Total transfers", value: report.totalCount }]}
      />

      {report.isEmpty ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <ReportEmptyState hasActiveFilters={hasActiveFilters} />
        </div>
      ) : (
        <>
          <CurrencyTotalTable
            title="Totals by currency"
            rows={report.byCurrency}
          />

          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Reference</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => {
                  const detailHref = hrefWithReturnTo(
                    `/transfers/${row.id}`,
                    returnTo,
                  );

                  return (
                    <ClickableTableRow key={row.id} href={detailHref}>
                      <TableCell className="font-mono text-sm font-semibold">
                        <Link href={detailHref} className="hover:underline">
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{row.senderName ?? "—"}</TableCell>
                      <TableCell>{row.receiverName ?? "—"}</TableCell>
                      <TableCell className="tabular-nums font-medium">
                        <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                          {row.currencyCode}
                        </span>
                        {row.amountDisplay}
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
