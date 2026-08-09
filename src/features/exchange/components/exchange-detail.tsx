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
import type { ExchangeDetail as ExchangeDetailModel } from "@/features/exchange/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type ExchangeDetailViewProps = {
  exchange: ExchangeDetailModel;
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

export function ExchangeDetailView({
  exchange,
  backHref = "/exchange",
  backLabel,
}: ExchangeDetailViewProps) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t.common.backToList;
  const relatedTransactionHref = hrefWithReturnTo(
    `/transactions/${exchange.relatedTransaction.id}`,
    `/exchange/${exchange.id}`,
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
                {exchange.reference}
              </Typography>
              <StatusBadge
                label={exchange.statusLabel}
                tone={toneForRecordStatus(exchange.status)}
              />
            </div>
            <Typography variant="muted">{t.pages.exchange}</Typography>
          </div>
        </div>
      </div>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          {t.exchange.information}
        </Typography>

        <dl className="space-y-4">
          <InfoRow
            label={t.wallets.customer}
            value={displayValue(exchange.customerName)}
          />
          <InfoRow
            label={t.exchange.fromCurrency}
            value={exchange.fromCurrencyCode}
          />
          <InfoRow
            label={t.exchange.toCurrency}
            value={exchange.toCurrencyCode}
          />
          <InfoRow
            label={t.exchange.fromAmount}
            value={exchange.originalAmountDisplay}
          />
          <InfoRow
            label={t.exchange.exchangeRateUsed}
            value={exchange.exchangeRateDisplay}
          />
          <InfoRow
            label={t.exchange.toAmount}
            value={exchange.convertedAmountDisplay}
          />
          <InfoRow label={t.common.notes} value={displayValue(exchange.notes)} />
          <InfoRow
            label={t.common.operator}
            value={displayValue(exchange.operatorName)}
          />
          <InfoRow label={t.common.date} value={formatDate(exchange.valueDate)} />
        </dl>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">{t.common.relatedTransaction}</Typography>

        <div className="space-y-4">
          <dl className="space-y-4">
            <InfoRow
              label={t.common.reference}
              value={exchange.relatedTransaction.reference}
            />
            <InfoRow
              label={t.common.type}
              value={exchange.relatedTransaction.typeLabel}
            />
            <InfoRow
              label={t.common.status}
              value={exchange.relatedTransaction.statusLabel}
            />
            <InfoRow
              label={t.common.date}
              value={
                exchange.relatedTransaction.postedAt
                  ? formatDateTime(exchange.relatedTransaction.postedAt)
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
        <Typography variant="h4">{t.exchange.relatedLedger}</Typography>

        {exchange.ledgerEntries.length === 0 ? (
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
                {exchange.ledgerEntries.map((entry) => (
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
