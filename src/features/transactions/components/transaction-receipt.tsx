import type { TransactionDetail } from "@/features/transactions/domain/types";

type TransactionReceiptProps = {
  transaction: TransactionDetail;
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

/**
 * Printable receipt layout. Shown on screen in the detail page and used for
 * browser print. No printer SDK integration.
 */
export function TransactionReceipt({ transaction }: TransactionReceiptProps) {
  return (
    <div className="receipt-print-root mx-auto max-w-md space-y-6 bg-white p-6 text-black">
      <header className="space-y-1 border-b border-black/20 pb-4 text-center">
        <p className="text-xl font-semibold tracking-tight">
          {transaction.appName}
        </p>
        <p className="text-sm">Transaction Receipt</p>
        <p className="text-xs text-black/60">
          {formatDateTime(transaction.postedAt ?? transaction.createdAt)}
        </p>
      </header>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Reference</dt>
          <dd className="font-medium">{transaction.reference}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Type</dt>
          <dd>{transaction.typeLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Status</dt>
          <dd>{transaction.statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Date</dt>
          <dd>{formatDate(transaction.valueDate)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Customer</dt>
          <dd>{displayValue(transaction.customerName)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Wallet</dt>
          <dd className="text-right">{transaction.walletDisplay}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Currency</dt>
          <dd>{transaction.currencyDisplay}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Amount</dt>
          <dd className="font-semibold tabular-nums">
            {transaction.amountDisplay}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Operator</dt>
          <dd>{displayValue(transaction.operatorName)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-black/60">Notes</dt>
          <dd className="max-w-[14rem] text-right whitespace-pre-wrap">
            {displayValue(transaction.notes)}
          </dd>
        </div>
      </dl>

      <section className="space-y-2 border-t border-black/20 pt-4">
        <p className="text-sm font-medium">Ledger Entries</p>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-black/15">
              <th className="py-1 pr-2 font-medium">Wallet</th>
              <th className="py-1 pr-2 font-medium">Dir</th>
              <th className="py-1 pr-2 font-medium">Cur</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transaction.ledgerEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-black/10">
                <td className="py-1.5 pr-2 align-top">{entry.walletName}</td>
                <td className="py-1.5 pr-2 align-top">{entry.direction}</td>
                <td className="py-1.5 pr-2 align-top">{entry.currencyCode}</td>
                <td className="py-1.5 text-right align-top tabular-nums">
                  {entry.amountDisplay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="border-t border-black/20 pt-4 text-center text-xs text-black/60">
        <p>Thank you for your business.</p>
        <p>This receipt is for record-keeping purposes.</p>
      </footer>
    </div>
  );
}
