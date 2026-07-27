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
import { Typography } from "@/design-system/typography";
import { ReportEmptyState } from "@/features/reports/components/report-empty-state";
import { ReportSection } from "@/features/reports/components/report-section";
import { ReportViewAllLink } from "@/features/reports/components/report-view-all-link";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { CustomerStatementReport } from "@/features/reports/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type CustomerStatementSectionProps = {
  filters: ReportsFilters;
  statement: CustomerStatementReport | null;
  hasActiveFilters: boolean;
};

function formatEventDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

export function CustomerStatementSection({
  filters,
  statement,
  hasActiveFilters,
}: CustomerStatementSectionProps) {
  const returnTo = buildReportsHref(filters);

  return (
    <ReportSection
      id="customer-statement"
      title="Customer Statement"
      description="Ledger-derived balances and recent history for one customer. Choose a customer in the filters above."
    >
      {filters.customerId ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ReportViewAllLink
            href={buildReportsHref(filters, "/reports/customer-statement")}
            label="Open statement detail"
          />
        </div>
      ) : null}

      {!filters.customerId ? (
        <ReportEmptyState
          title="Select a customer"
          description="Use the Customer filter above to load balances and history for a statement."
        />
      ) : !statement ? (
        <ReportEmptyState
          hasActiveFilters={hasActiveFilters}
          title="Customer not found"
          description="The selected customer could not be loaded. Clear filters and try again."
        />
      ) : (
        <div className="space-y-5">
          <Typography variant="bodySm" className="font-semibold">
            {statement.customerLabel}
          </Typography>

          <div className="space-y-2">
            <Typography variant="bodySm" className="font-semibold">
              Current balances
            </Typography>
            {statement.balances.length === 0 ? (
              <ReportEmptyState
                hasActiveFilters={hasActiveFilters}
                title="No balances"
                description="No currency balances match the current filters for this customer."
              />
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {statement.balances.map((balance) => (
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

          <div className="space-y-2">
            <Typography variant="bodySm" className="font-semibold">
              Recent history ({statement.eventTotal} matching events)
            </Typography>
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              {statement.isEmpty ? (
                <ReportEmptyState hasActiveFilters={hasActiveFilters} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.events.map((event) => {
                      const detailHref = hrefWithReturnTo(
                        `/transactions/${event.transactionId}`,
                        returnTo,
                      );

                      return (
                        <ClickableTableRow key={event.id} href={detailHref}>
                          <TableCell>{formatEventDate(event.date)}</TableCell>
                          <TableCell>{event.typeLabel}</TableCell>
                          <TableCell className="font-mono text-sm">
                            <Link
                              href={detailHref}
                              className="hover:underline"
                            >
                              {event.reference}
                            </Link>
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">
                            <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                              {event.currencyCode} · {event.direction}
                            </span>
                            {event.amountDisplay}
                          </TableCell>
                        </ClickableTableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}
    </ReportSection>
  );
}
