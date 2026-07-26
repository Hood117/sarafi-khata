import type { TransactionStatus } from "@/generated/prisma/client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type TransactionsTableProps = {
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

function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        status === "POSTED" && "bg-success/15 text-success",
        status === "DRAFT" && "bg-muted text-muted-foreground",
        status === "VOIDED" && "bg-destructive/10 text-destructive",
      )}
    >
      {TRANSACTION_STATUS_LABELS[status]}
    </span>
  );
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  const total = transactions.length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
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
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {transaction.reference}
                  </TableCell>
                  <TableCell>
                    {TRANSACTION_TYPE_LABELS[transaction.type]}
                  </TableCell>
                  <TableCell>
                    {displayValue(transaction.customerName)}
                  </TableCell>
                  <TableCell>{transaction.currencyDisplay}</TableCell>
                  <TableCell className="tabular-nums">
                    {transaction.amountDisplay}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={transaction.status} />
                  </TableCell>
                  <TableCell>
                    {displayValue(transaction.operatorName)}
                  </TableCell>
                  <TableCell>
                    {formatValueDate(transaction.valueDate)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/transactions/${transaction.id}`} />}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
