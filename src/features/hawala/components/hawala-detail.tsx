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
import { CancelHawalaButton } from "@/features/hawala/components/cancel-hawala-button";
import { ArchiveHawalaButton } from "@/features/hawala/components/archive-hawala-button";
import { EditHawalaDialog } from "@/features/hawala/components/edit-hawala-dialog";
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaDetail as HawalaDetailModel,
  HawalaPartnerOption,
} from "@/features/hawala/domain/types";
import { cn } from "@/lib/utils";
import { formatMessage, useT } from "@/lib/i18n";

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
  customers: HawalaCustomerOption[];
  partners: HawalaPartnerOption[];
  currencies: HawalaCurrencyOption[];
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

function partyDisplay(
  name: string,
  phone: string | null,
  customerDisplay: string | null,
  localCustomerTag: string,
  externalTag: string,
): string {
  const phoneTrimmed = phone?.trim();
  const base = phoneTrimmed ? `${name} (${phoneTrimmed})` : name;
  if (customerDisplay) {
    return `${base} · ${formatMessage(localCustomerTag, { name: customerDisplay })}`;
  }
  return `${base} · ${externalTag}`;
}

export function HawalaDetailView({
  hawala,
  customers,
  partners,
  currencies,
  backHref = "/hawala",
  backLabel,
}: HawalaDetailViewProps) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t.hawala.backToList;
  const returnTo = `/hawala/${hawala.id}`;
  const relatedTransactionHref = hawala.relatedTransaction
    ? buildRelatedTransactionHref(hawala.relatedTransaction.id, returnTo)
    : null;

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
                {hawala.reference}
              </Typography>
              <StatusBadge
                label={hawala.isArchived ? t.common.archived : hawala.statusLabel}
                tone={toneForRecordStatus(
                  hawala.isArchived ? "ARCHIVED" : hawala.status,
                )}
              />
            </div>
            <Typography variant="muted">{hawala.directionLabel}</Typography>
          </div>
        </div>

        {hawala.isArchived ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <EditHawalaDialog
              hawalaId={hawala.id}
              customers={customers}
              partners={partners}
              currencies={currencies}
            />
            {hawala.status === "PENDING" ? (
              <CancelHawalaButton
                hawalaId={hawala.id}
                reference={hawala.reference}
              />
            ) : null}
            <ArchiveHawalaButton
              hawalaId={hawala.id}
              reference={hawala.reference}
            />
          </div>
        )}
      </div>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          {t.hawala.information}
        </Typography>

        <dl className="space-y-4">
          <InfoRow
            label={t.hawala.sender}
            value={partyDisplay(
              hawala.senderName,
              hawala.senderPhone,
              hawala.senderCustomerDisplay,
              t.hawala.localCustomerTag,
              t.hawala.externalTag,
            )}
          />
          <InfoRow
            label={t.hawala.receiver}
            value={partyDisplay(
              hawala.receiverName,
              hawala.receiverPhone,
              hawala.receiverCustomerDisplay,
              t.hawala.localCustomerTag,
              t.hawala.externalTag,
            )}
          />
          <InfoRow label={t.hawala.partner} value={hawala.partnerSarafi} />
          {hawala.commissionAmountDisplay ? (
            <InfoRow
              label={t.hawala.partnerCommissionAmount}
              value={`${hawala.commissionAmountDisplay}${
                hawala.commissionSideLabel
                  ? ` — ${hawala.commissionSideLabel}`
                  : ""
              }`}
            />
          ) : null}
          {hawala.ownCommissionAmountDisplay ? (
            <InfoRow
              label={t.hawala.ownCommissionAmount}
              value={hawala.ownCommissionAmountDisplay}
            />
          ) : null}
          <InfoRow label={t.hawala.origin} value={hawala.originDisplay} />
          <InfoRow label={t.hawala.destination} value={hawala.destinationDisplay} />
          <InfoRow label={t.common.currency} value={hawala.currencyCode} />
          <InfoRow label={t.common.amount} value={hawala.amountDisplay} />
          <InfoRow label={t.common.status} value={hawala.statusLabel} />
          <InfoRow label={t.hawala.referenceNumber} value={hawala.reference} />
          <InfoRow label={t.common.notes} value={displayValue(hawala.notes)} />
          <InfoRow label={t.audit.actor} value={displayValue(hawala.operatorName)} />
          <InfoRow label={t.hawala.valueDate} value={formatDate(hawala.valueDate)} />
        </dl>
      </section>

      <section
        className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
        aria-labelledby="hawala-timeline-heading"
      >
        <Typography variant="h4" id="hawala-timeline-heading" className="font-bold">
          {t.common.timeline}
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
                        label={event.statusLabel}
                        tone={toneForRecordStatus(event.status)}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">{t.common.relatedTransaction}</Typography>

        {hawala.relatedTransaction && relatedTransactionHref ? (
          <div className="space-y-4">
            <dl className="space-y-4">
              <InfoRow
                label={t.common.reference}
                value={hawala.relatedTransaction.reference}
              />
              <InfoRow
                label={t.common.type}
                value={hawala.relatedTransaction.typeLabel}
              />
              <InfoRow
                label={t.common.status}
                value={hawala.relatedTransaction.statusLabel}
              />
              <InfoRow
                label={t.hawala.posted}
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
              {t.common.view}
            </Button>
          </div>
        ) : (
          <Typography variant="muted">
            {t.common.none}
          </Typography>
        )}
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">{t.hawala.relatedLedger}</Typography>

        {hawala.ledgerEntries.length === 0 ? (
          <Typography variant="muted">
            {t.common.none}
          </Typography>
        ) : (
          <div className="overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.common.wallet}</TableHead>
                  <TableHead>{t.hawala.direction}</TableHead>
                  <TableHead>{t.common.currency}</TableHead>
                  <TableHead>{t.common.amount}</TableHead>
                  <TableHead>{t.common.notes}</TableHead>
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
