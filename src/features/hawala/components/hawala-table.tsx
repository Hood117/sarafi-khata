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
import { HawalaEmptyState } from "@/features/hawala/components/hawala-empty-state";
import type { HawalaListItem } from "@/features/hawala/domain/types";
import { cn } from "@/lib/utils";

type HawalaTableProps = {
  transfers: HawalaListItem[];
  hasSearch?: boolean;
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

function StatusBadge({
  status,
  label,
}: {
  status: HawalaListItem["status"];
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        status === "COMPLETED" && "bg-success/15 text-success",
        status === "PENDING" && "bg-muted text-muted-foreground",
        status === "CANCELLED" && "bg-destructive/10 text-destructive",
      )}
    >
      {label}
    </span>
  );
}

export function HawalaTable({
  transfers,
  hasSearch = false,
}: HawalaTableProps) {
  const total = transfers.length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
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
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell className="font-medium font-mono text-xs sm:text-sm">
                    {transfer.reference}
                  </TableCell>
                  <TableCell>{transfer.senderName}</TableCell>
                  <TableCell>{transfer.receiverName}</TableCell>
                  <TableCell>{transfer.partnerSarafi}</TableCell>
                  <TableCell>{transfer.originDisplay}</TableCell>
                  <TableCell>{transfer.destinationDisplay}</TableCell>
                  <TableCell>{transfer.currencyCode}</TableCell>
                  <TableCell className="tabular-nums">
                    {transfer.amountDisplay}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={transfer.status}
                      label={transfer.statusLabel}
                    />
                  </TableCell>
                  <TableCell>{formatValueDate(transfer.valueDate)}</TableCell>
                  <TableCell>{displayValue(transfer.operatorName)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/hawala/${transfer.id}`} />}
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
