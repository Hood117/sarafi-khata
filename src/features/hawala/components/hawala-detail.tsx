import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
import type { HawalaDetail as HawalaDetailModel } from "@/features/hawala/domain/types";
import { cn } from "@/lib/utils";

function buildRelatedTransactionHref(
  transactionId: string,
  returnTo: string,
): string {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  return `/transactions/${transactionId}?${params.toString()}`;
}

type HawalaDetailViewProps = {
  hawala: HawalaDetailModel;
};

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
  status: HawalaDetailModel["status"];
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function partyDisplay(
  name: string,
  phone: string | null,
  customerDisplay: string | null,
): string {
  const phoneTrimmed = phone?.trim();
  const base = phoneTrimmed ? `${name} (${phoneTrimmed})` : name;
  if (customerDisplay) {
    return `${base} · Local customer: ${customerDisplay}`;
  }
  return `${base} · External`;
}

export function HawalaDetailView({ hawala }: HawalaDetailViewProps) {
  const returnTo = `/hawala/${hawala.id}`;
  const relatedTransactionHref = hawala.relatedTransaction
    ? buildRelatedTransactionHref(hawala.relatedTransaction.id, returnTo)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/hawala" />}
            className="text-muted-foreground -ml-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to hawala
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Typography variant="h3" as="h2">
                {hawala.reference}
              </Typography>
              <StatusBadge status={hawala.status} label={hawala.statusLabel} />
            </div>
            <Typography variant="muted">{hawala.directionLabel} hawala</Typography>
          </div>
        </div>
      </div>

      <section className="ring-foreground/10 space-y-5 rounded-xl p-4 ring-1 sm:p-6">
        <Typography variant="h4">Hawala information</Typography>

        <dl className="space-y-4">
          <InfoRow
            label="Sender"
            value={partyDisplay(
              hawala.senderName,
              hawala.senderPhone,
              hawala.senderCustomerDisplay,
            )}
          />
          <InfoRow
            label="Receiver"
            value={partyDisplay(
              hawala.receiverName,
              hawala.receiverPhone,
              hawala.receiverCustomerDisplay,
            )}
          />
          <InfoRow label="Partner Sarafi" value={hawala.partnerSarafi} />
          <InfoRow label="Origin" value={hawala.originDisplay} />
          <InfoRow label="Destination" value={hawala.destinationDisplay} />
          <InfoRow label="Currency" value={hawala.currencyCode} />
          <InfoRow label="Amount" value={hawala.amountDisplay} />
          <InfoRow label="Status" value={hawala.statusLabel} />
          <InfoRow label="Reference Number" value={hawala.reference} />
          <InfoRow label="Notes" value={displayValue(hawala.notes)} />
          <InfoRow label="Operator" value={displayValue(hawala.operatorName)} />
          <InfoRow label="Value date" value={formatDate(hawala.valueDate)} />
        </dl>
      </section>

      <section
        className="ring-foreground/10 space-y-4 rounded-xl p-4 ring-1 sm:p-6"
        aria-labelledby="hawala-timeline-heading"
      >
        <Typography variant="h4" id="hawala-timeline-heading">
          Timeline
        </Typography>

        <ol className="px-1">
          {hawala.timeline.map((event, index) => {
            const isLast = index === hawala.timeline.length - 1;
            return (
              <li key={event.id} className="relative flex gap-4">
                <div
                  className="flex w-3 shrink-0 flex-col items-center"
                  aria-hidden
                >
                  <span className="bg-foreground/35 ring-background mt-1.5 size-2.5 shrink-0 rounded-full ring-4" />
                  {isLast ? null : (
                    <span className="bg-foreground/10 mt-1 w-px flex-1" />
                  )}
                </div>
                <div className={cn("min-w-0 flex-1 py-1", !isLast && "mb-3")}>
                  <Typography variant="caption" as="p">
                    {formatDateTime(event.at)}
                  </Typography>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Typography variant="bodySm" className="font-medium">
                      {event.label}
                    </Typography>
                    {event.status && event.statusLabel ? (
                      <StatusBadge
                        status={event.status}
                        label={event.statusLabel}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ring-foreground/10 space-y-4 rounded-xl p-4 ring-1 sm:p-6">
        <Typography variant="h4">Related Transaction</Typography>

        {hawala.relatedTransaction && relatedTransactionHref ? (
          <div className="space-y-4">
            <dl className="space-y-4">
              <InfoRow
                label="Reference"
                value={hawala.relatedTransaction.reference}
              />
              <InfoRow
                label="Type"
                value={hawala.relatedTransaction.typeLabel}
              />
              <InfoRow
                label="Status"
                value={hawala.relatedTransaction.statusLabel}
              />
              <InfoRow
                label="Posted"
                value={
                  hawala.relatedTransaction.postedAt
                    ? formatDateTime(hawala.relatedTransaction.postedAt)
                    : "—"
                }
              />
            </dl>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={relatedTransactionHref} />}
            >
              View transaction
            </Button>
          </div>
        ) : (
          <Typography variant="muted">
            No posted transaction is linked yet. Pending or cancelled hawala
            transfers may not have financial postings.
          </Typography>
        )}
      </section>

      <section className="ring-foreground/10 space-y-4 rounded-xl p-4 ring-1 sm:p-6">
        <Typography variant="h4">Related Ledger Entries</Typography>

        {hawala.ledgerEntries.length === 0 ? (
          <Typography variant="muted">
            No ledger entries are linked to this hawala transfer.
          </Typography>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Wallet</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hawala.ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.walletName}
                    </TableCell>
                    <TableCell>{entry.direction}</TableCell>
                    <TableCell>{entry.currencyCode}</TableCell>
                    <TableCell className="tabular-nums">
                      {entry.amountDisplay}
                    </TableCell>
                    <TableCell>{displayValue(entry.memo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
