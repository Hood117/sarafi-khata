"use client";

import Link from "next/link";

import { ClickableTableRow } from "@/components/clickable-table-row";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/features/transactions/domain/labels";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type DashboardRecentActivityProps = {
  transactions: TransactionListItem[];
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

export function DashboardRecentActivity({
  transactions,
}: DashboardRecentActivityProps) {
  return (
    <section
      className="space-y-4"
      aria-labelledby="dashboard-recent-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Typography
            variant="h4"
            id="dashboard-recent-heading"
            className="font-bold"
          >
            Recent Activity
          </Typography>
          <Typography variant="muted">
            Latest posted transactions across the shop.
          </Typography>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/transactions" />}
        >
          View all
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {transactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Typography variant="muted">
              No posted transactions yet. Use Quick Actions to create one.
            </Typography>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => {
                const detailHref = hrefWithReturnTo(
                  `/transactions/${transaction.id}`,
                  "/",
                );

                return (
                  <ClickableTableRow key={transaction.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {transaction.reference}
                    </TableCell>
                    <TableCell>
                      {TRANSACTION_TYPE_LABELS[transaction.type]}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {displayValue(transaction.customerName)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                        {transaction.currencyDisplay}
                      </span>
                      {transaction.amountDisplay}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge
                        label={TRANSACTION_STATUS_LABELS[transaction.status]}
                        tone={toneForRecordStatus(transaction.status)}
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatValueDate(transaction.valueDate)}
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
