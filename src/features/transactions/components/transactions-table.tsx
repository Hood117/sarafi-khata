"use client";

import type { TransactionStatus } from "@/generated/prisma/client";
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
import { TransactionsEmptyState } from "@/features/transactions/components/transactions-empty-state";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/features/transactions/domain/labels";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type TransactionsTableProps = {
  transactions: TransactionListItem[];
  /** When set, detail links return here instead of `/transactions`. */
  returnTo?: string;
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

function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <StatusBadge
      label={TRANSACTION_STATUS_LABELS[status]}
      tone={toneForRecordStatus(status)}
    />
  );
}

export function TransactionsTable({
  transactions,
  returnTo = "/transactions",
}: TransactionsTableProps) {
  const total = transactions.length;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <TransactionsEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference Number</TableHead>
                <TableHead>Transaction Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
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
                      {transaction.reference}
                    </TableCell>
                    <TableCell>
                      {TRANSACTION_TYPE_LABELS[transaction.type]}
                    </TableCell>
                    <TableCell>
                      {displayValue(transaction.customerName)}
                    </TableCell>
                    <TableCell>{transaction.currencyDisplay}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {transaction.amountDisplay}
                    </TableCell>
                    <TableCell>
                      <TransactionStatusBadge status={transaction.status} />
                    </TableCell>
                    <TableCell>
                      {displayValue(transaction.operatorName)}
                    </TableCell>
                    <TableCell>
                      {formatValueDate(transaction.valueDate)}
                    </TableCell>
                    <TableCell data-row-click-ignore>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={detailHref} />}
                      >
                        View
                      </Button>
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography variant="muted">
          {total === 0
            ? "No transactions to display"
            : `Showing ${total} transaction${total === 1 ? "" : "s"}`}
        </Typography>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
