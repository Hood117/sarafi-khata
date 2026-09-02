import {
  fmtAmountPart,
  type AmountPart,
} from "@desktop/lib/format-transaction-line";

/** Emphasized signed money for ledger/transaction tables. Mixed sides stay separate. */
export function LedgerAmount({ parts }: { parts: AmountPart[] }) {
  if (!parts.length) return <span className="muted">—</span>;
  return (
    <span className="ledger-amount">
      {parts.map((p, i) => (
        <span
          key={`${p.sign}-${p.currency}-${p.amount}-${i}`}
          className={`amount-emphasis ${p.sign === "+" ? "money-in" : "money-out"}`}
        >
          {fmtAmountPart(p)}
        </span>
      ))}
    </span>
  );
}
