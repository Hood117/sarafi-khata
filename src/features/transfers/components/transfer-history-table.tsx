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
import { TransferHistoryEmptyState } from "@/features/transfers/components/transfer-history-empty-state";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type TransferHistoryTableProps = {
  transfers: TransferHistoryListItem[];
  hasSearch?: boolean;
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

function TransferStatusBadge({
  status,
  label,
}: {
  status: TransactionStatus;
  label: string;
}) {
  return (
    <StatusBadge label={label} tone={toneForRecordStatus(status)} />
  );
}

export function TransferHistoryTable({
  transfers,
  hasSearch = false,
  returnTo = "/transfers",
}: TransferHistoryTableProps) {
  const total = transfers.length;

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <TransferHistoryEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference Number</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Receiver</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const detailHref = hrefWithReturnTo(
                  `/transfers/${transfer.id}`,
                  returnTo,
                );

                return (
                  <ClickableTableRow key={transfer.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {transfer.reference}
                    </TableCell>
                    <TableCell>{displayValue(transfer.senderName)}</TableCell>
                    <TableCell>
                      {displayValue(transfer.receiverName)}
                    </TableCell>
                    <TableCell>{transfer.currencyCode}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {transfer.amountDisplay}
                    </TableCell>
                    <TableCell>
                      {displayValue(transfer.operatorName)}
                    </TableCell>
                    <TableCell>
                      {formatValueDate(transfer.valueDate)}
                    </TableCell>
                    <TableCell>
                      <TransferStatusBadge
                        status={transfer.status}
                        label={transfer.statusLabel}
                      />
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
            ? hasSearch
              ? "No matching transfers"
              : "No transfers to display"
            : `Showing ${total} transfer${total === 1 ? "" : "s"}`}
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
