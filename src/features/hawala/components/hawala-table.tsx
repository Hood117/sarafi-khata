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
import { HawalaEmptyState } from "@/features/hawala/components/hawala-empty-state";
import type { HawalaListItem } from "@/features/hawala/domain/types";

import { hrefWithReturnTo } from "@/lib/navigation";

type HawalaTableProps = {
  transfers: HawalaListItem[];
  hasSearch?: boolean;
  /** When set, detail links include returnTo for back navigation. */
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

export function HawalaTable({
  transfers,
  hasSearch = false,
  returnTo,
}: HawalaTableProps) {
  const total = transfers.length;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <HawalaEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference Number</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Receiver</TableHead>
                <TableHead>Partner Sarafi</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const detailHref = returnTo
                  ? hrefWithReturnTo(`/hawala/${transfer.id}`, returnTo)
                  : `/hawala/${transfer.id}`;

                return (
                  <ClickableTableRow key={transfer.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {transfer.reference}
                    </TableCell>
                    <TableCell>{transfer.senderName}</TableCell>
                    <TableCell>{transfer.receiverName}</TableCell>
                    <TableCell>{transfer.partnerSarafi}</TableCell>
                    <TableCell>{transfer.originDisplay}</TableCell>
                    <TableCell>{transfer.destinationDisplay}</TableCell>
                    <TableCell>{transfer.currencyCode}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {transfer.amountDisplay}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={transfer.statusLabel}
                        tone={toneForRecordStatus(transfer.status)}
                      />
                    </TableCell>
                    <TableCell>{formatValueDate(transfer.valueDate)}</TableCell>
                    <TableCell>
                      {displayValue(transfer.operatorName)}
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
              : "No hawala transfers to display"
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
