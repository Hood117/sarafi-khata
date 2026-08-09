"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
import type { TransferDetail as TransferDetailModel } from "@/features/transfers/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type TransferDetailViewProps = {
  transfer: TransferDetailModel;
  backHref?: string;
  backLabel?: string;
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export function TransferDetailView({
  transfer,
  backHref = "/transfers",
  backLabel,
}: TransferDetailViewProps) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t.common.backToList;
  const relatedTransactionHref = hrefWithReturnTo(
    `/transactions/${transfer.relatedTransaction.id}`,
    `/transfers/${transfer.id}`,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={backHref} />}
            className="text-muted-foreground -ms-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            {resolvedBackLabel}
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Typography variant="h3" as="h2">
                {transfer.reference}
              </Typography>
              <StatusBadge
                label={transfer.statusLabel}
                tone={toneForRecordStatus(transfer.status)}
              />
            </div>
            <Typography variant="muted">{t.pages.transfers}</Typography>
          </div>
        </div>
      </div>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          {t.transfers.information}
        </Typography>

        <dl className="space-y-4">
          <InfoRow
            label={t.transfers.senderCustomer}
            value={displayValue(transfer.senderName)}
          />
          <InfoRow
            label={t.transfers.receiverCustomer}
            value={displayValue(transfer.receiverName)}
          />
          <InfoRow label={t.common.currency} value={transfer.currencyCode} />
          <InfoRow label={t.common.amount} value={transfer.amountDisplay} />
          <InfoRow label={t.common.reference} value={transfer.reference} />
          <InfoRow label={t.common.notes} value={displayValue(transfer.notes)} />
          <InfoRow
            label={t.common.operator}
            value={displayValue(transfer.operatorName)}
          />
          <InfoRow label={t.common.date} value={formatDate(transfer.valueDate)} />
        </dl>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">{t.common.relatedTransaction}</Typography>

        <div className="space-y-4">
          <dl className="space-y-4">
            <InfoRow
              label={t.common.reference}
              value={transfer.relatedTransaction.reference}
            />
            <InfoRow
              label={t.common.type}
              value={transfer.relatedTransaction.typeLabel}
            />
            <InfoRow
              label={t.common.status}
              value={transfer.relatedTransaction.statusLabel}
            />
            <InfoRow
              label={t.common.date}
              value={
                transfer.relatedTransaction.postedAt
                  ? formatDateTime(transfer.relatedTransaction.postedAt)
                  : "—"
              }
            />
          </dl>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={relatedTransactionHref} />}
          >
            {t.common.view}
          </Button>
        </div>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">{t.transfers.relatedLedger}</Typography>

        {transfer.ledgerEntries.length === 0 ? (
          <Typography variant="muted">{t.common.none}</Typography>
        ) : (
          <div className="overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.common.wallet}</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>{t.common.currency}</TableHead>
                  <TableHead>{t.common.amount}</TableHead>
                  <TableHead>{t.common.notes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.ledgerEntries.map((entry) => (
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
