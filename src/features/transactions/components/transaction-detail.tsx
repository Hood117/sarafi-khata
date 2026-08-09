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
import { PrintReceiptButton } from "@/features/transactions/components/print-receipt-button";
import { TransactionReceipt } from "@/features/transactions/components/transaction-receipt";
import { VoidTransactionButton } from "@/features/transactions/components/void-transaction-button";
import type { TransactionDetail as TransactionDetailModel } from "@/features/transactions/domain/types";

type TransactionDetailViewProps = {
  transaction: TransactionDetailModel;
  /** Safe internal path for the back link (defaults to the transactions list). */
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

export function TransactionDetailView({
  transaction,
  backHref = "/transactions",
  backLabel = "Back to transactions",
}: TransactionDetailViewProps) {
  return (
    <div className="space-y-2">
      <div className="print:hidden flex flex-wrap items-start justify-between gap-4">
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
                {transaction.reference}
              </Typography>
              <StatusBadge
                label={transaction.statusLabel}
                tone={toneForRecordStatus(transaction.status)}
              />
            </div>
            <Typography variant="muted">{transaction.typeLabel}</Typography>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {transaction.status === "POSTED" ? (
            <VoidTransactionButton
              transactionId={transaction.id}
              reference={transaction.reference}
            />
          ) : null}
          <PrintReceiptButton />
        </div>
      </div>

      <section className="bg-card print:hidden ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          Transaction Information
        </Typography>

        <dl className="space-y-4">
          <InfoRow label="Reference" value={transaction.reference} />
          <InfoRow label="Type" value={transaction.typeLabel} />
          <InfoRow
            label="Customer"
            value={displayValue(transaction.customerName)}
          />
          <InfoRow label="Wallet" value={transaction.walletDisplay} />
          <InfoRow label="Currency" value={transaction.currencyDisplay} />
          <InfoRow label="Amount" value={transaction.amountDisplay} />
          <InfoRow label="Notes" value={displayValue(transaction.notes)} />
          <InfoRow
            label="Operator"
            value={displayValue(transaction.operatorName)}
          />
          <InfoRow label="Date" value={formatDate(transaction.valueDate)} />
          <InfoRow
            label="Posted"
            value={
              transaction.postedAt
                ? formatDateTime(transaction.postedAt)
                : "—"
            }
          />
        </dl>
      </section>

      <section className="print:hidden ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">Ledger Entries</Typography>

        {transaction.ledgerEntries.length === 0 ? (
          <Typography variant="muted">
            No ledger entries are linked to this transaction.
          </Typography>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
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
                {transaction.ledgerEntries.map((entry) => (
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

      <section className="print:hidden ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <Typography variant="h4">Receipt Preview</Typography>
        <Typography variant="muted">
          Use Print Receipt to open the browser print dialog. Printer hardware
          integration is not connected yet.
        </Typography>
        <div className="bg-muted/40 overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <TransactionReceipt transaction={transaction} />
        </div>
      </section>

      {/* Print-only receipt (avoids nested preview chrome). */}
      <div className="hidden print:block">
        <TransactionReceipt transaction={transaction} />
      </div>
    </div>
  );
}
