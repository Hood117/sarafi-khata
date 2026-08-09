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
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type PeriodTransactionsTableProps = {
  transactions: TransactionListItem[];
  filters: ReportsFilters;
  hasActiveFilters?: boolean;
};

function formatValueDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function PeriodTransactionsTable({
  transactions,
  filters,
  hasActiveFilters = false,
}: PeriodTransactionsTableProps) {
  const t = useT();
  const returnTo = buildReportsHref(filters);

  return (
    <div className="space-y-2">
      <Typography variant="bodySm" className="font-semibold">
        Summary
      </Typography>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {transactions.length === 0 ? (
          <ReportEmptyState hasActiveFilters={hasActiveFilters} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.reference}</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Customer</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => {
                const detailHref = hrefWithReturnTo(
                  `/transactions/${transaction.id}`,
                  returnTo,
                );

                return (
                  <ClickableTableRow key={transaction.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      <Link href={detailHref} className="hover:underline">
                        {transaction.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {transaction.typeLabel ||
                        TRANSACTION_TYPE_LABELS[transaction.type]}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {displayValue(transaction.customerName)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      <span className="text-muted-foreground me-1.5 text-xs font-normal">
                        {transaction.currencyDisplay}
                      </span>
                      {transaction.amountDisplay}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatValueDate(transaction.valueDate)}
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
