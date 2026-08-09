"use client";

import type { TransactionStatus, TransactionType } from "@/generated/prisma/client";
import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { Badge } from "@/components/ui/badge";
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
import { TransactionsEmptyState } from "@/features/transactions/components/transactions-empty-state";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/features/transactions/domain/labels";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { cn } from "@/lib/utils";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type TransactionsTableProps = {
  transactions: TransactionListItem[];
  /** When set, detail links return here instead of `/transactions`. */
  returnTo?: string;
  /** Emphasize type as a colored badge (daily book). */
  emphasizeType?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  previousHref?: string;
  nextHref?: string;
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

function typeBadgeClass(type: TransactionType, typeLabel: string): string {
  if (typeLabel === "Added to wallet") {
    return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25";
  }
  if (typeLabel === "External money") {
    return "bg-primary/12 text-primary ring-primary/25";
  }
  if (typeLabel === "Sent Hawala") {
    return "bg-rose-500/15 text-rose-800 ring-rose-500/25";
  }
  if (typeLabel === "Received Hawala") {
    return "bg-teal-500/15 text-teal-800 ring-teal-500/25";
  }

  switch (type) {
    case "HAWALA":
      return "bg-sky-500/15 text-sky-800 ring-sky-500/25";
    case "EXCHANGE":
      return "bg-amber-500/15 text-amber-900 ring-amber-500/25";
    case "TRANSFER":
      return "bg-violet-500/15 text-violet-800 ring-violet-500/25";
    case "DEPOSIT":
      return "bg-green-500/15 text-green-800 ring-green-500/25";
    case "WITHDRAWAL":
      return "bg-orange-500/15 text-orange-900 ring-orange-500/25";
    default:
      return "bg-muted text-foreground ring-foreground/10";
  }
}

function TransactionTypeCell({
  transaction,
  emphasizeType,
}: {
  transaction: TransactionListItem;
  emphasizeType: boolean;
}) {
  const label =
    transaction.typeLabel || TRANSACTION_TYPE_LABELS[transaction.type];

  if (!emphasizeType) {
    return <span className="font-medium">{label}</span>;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-semibold ring-1",
        typeBadgeClass(transaction.type, label),
      )}
    >
      {label}
    </Badge>
  );
}

export function TransactionsTable({
  transactions,
  returnTo = "/transactions",
  emphasizeType = false,
  total,
  page = 1,
  pageSize = 25,
  previousHref,
  nextHref,
}: TransactionsTableProps) {
  const t = useT();
  const showing = transactions.length;
  const resolvedTotal = total ?? showing;
  const paginated =
    previousHref != null && nextHref != null && total != null;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <TransactionsEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference Number</TableHead>
                <TableHead>Transaction Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>{t.common.currency}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>{t.common.date}</TableHead>
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
                      <TransactionTypeCell
                        transaction={transaction}
                        emphasizeType={emphasizeType}
                      />
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

      {paginated ? (
        <ListPagination
          total={resolvedTotal}
          page={page}
          pageSize={pageSize}
          showing={showing}
          previousHref={previousHref}
          nextHref={nextHref}
          emptyLabel={t.common.noData}
          ariaLabel="Transaction pagination"
        />
      ) : (
        <div className="text-muted-foreground text-sm">
          {showing === 0
            ? t.common.noData
            : `${t.common.showing} ${showing}`}
        </div>
      )}
    </div>
  );
}
