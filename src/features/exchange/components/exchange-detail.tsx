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
  backLabel = "Back to exchange",
}: ExchangeDetailViewProps) {
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
            className="text-muted-foreground -ml-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            {backLabel}
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
            <Typography variant="muted">Currency exchange</Typography>
          </div>
        </div>
      </div>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          Exchange information
        </Typography>

        <dl className="space-y-4">
          <InfoRow
            label="Customer"
            value={displayValue(exchange.customerName)}
          />
          <InfoRow label="From Currency" value={exchange.fromCurrencyCode} />
          <InfoRow label="To Currency" value={exchange.toCurrencyCode} />
          <InfoRow
            label="Original Amount"
            value={exchange.originalAmountDisplay}
          />
          <InfoRow
            label="Exchange Rate Used"
            value={exchange.exchangeRateDisplay}
          />
          <InfoRow
            label="Converted Amount"
            value={exchange.convertedAmountDisplay}
          />
          <InfoRow label="Notes" value={displayValue(exchange.notes)} />
          <InfoRow
            label="Operator"
            value={displayValue(exchange.operatorName)}
          />
          <InfoRow label="Date" value={formatDate(exchange.valueDate)} />
        </dl>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">Related Transaction</Typography>

        <div className="space-y-4">
          <dl className="space-y-4">
            <InfoRow
              label="Reference"
              value={exchange.relatedTransaction.reference}
            />
            <InfoRow
              label="Type"
              value={exchange.relatedTransaction.typeLabel}
            />
            <InfoRow
              label="Status"
              value={exchange.relatedTransaction.statusLabel}
            />
            <InfoRow
              label="Posted"
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
            View transaction
          </Button>
        </div>
      </section>

      <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">Ledger Entries</Typography>

        {exchange.ledgerEntries.length === 0 ? (
          <Typography variant="muted">
            No ledger entries are linked to this exchange.
          </Typography>
        ) : (
          <div className="overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
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
