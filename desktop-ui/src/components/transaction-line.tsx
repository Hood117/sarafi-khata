import type { CSSProperties } from "react";

import { TransactionTypeIcon } from "@desktop/components/transaction-type-icon";
import { useT } from "@desktop/i18n";
import {
  describeTransactionLine,
  fmtAmountPart,
  type TransactionLineInput,
  type TransactionLineLabels,
} from "@desktop/lib/format-transaction-line";
import { statusLabel } from "@desktop/lib/i18n-labels";

type Props = {
  input: TransactionLineInput;
  className?: string;
  style?: CSSProperties;
  /** Stronger weight for list/detail headlines. */
  strong?: boolean;
  /** Description-only (amount lives in a dedicated table column). */
  hideAmounts?: boolean;
};

export function txLineLabelsFromDict(t: {
  txLine: TransactionLineLabels;
}): TransactionLineLabels {
  return t.txLine;
}

/**
 * Colored customer-facing transaction line.
 * Green = money in (+), red = money out (−).
 */
export function TransactionLine({ input, className, style, strong, hideAmounts }: Props) {
  const t = useT();
  const labels = txLineLabelsFromDict(t);
  const line = describeTransactionLine(input, labels, (s) => statusLabel(t, s));
  const classes = [
    "tx-line",
    `tx-line-${line.flow}`,
    strong ? "tx-line-strong" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const isExchange =
    line.action === labels.exchanged &&
    line.amounts.length === 2 &&
    line.amounts[0].sign === "−" &&
    line.amounts[1].sign === "+";

  if (line.transfer) {
    const amtClass =
      line.flow === "in" ? "tx-amt tx-amt-in" : "tx-amt tx-amt-out";
    const money =
      line.transfer.amount && line.transfer.currency
        ? `${line.transfer.amount} ${line.transfer.currency}`
        : line.transfer.amount || line.transfer.currency || "—";
    return (
      <span className={classes} style={style} title={line.plain}>
        <TransactionTypeIcon type={input.type} />
        <span className="tx-line-dot" aria-hidden="true" />
        <span className="tx-line-who">{line.transfer.sender}</span>{" "}
        <span className="tx-line-action">{labels.transferred}</span>
        {hideAmounts ? null : (
          <>
            {" "}
            <span className={amtClass}>{money}</span>
          </>
        )}
        <span className="tx-line-arrow"> {labels.to} </span>
        <span className="tx-line-who">{line.transfer.receiver}</span>
        {line.suffix ? <span className="tx-line-suffix">{line.suffix}</span> : null}
      </span>
    );
  }

  if (line.fromStoredDescription) {
    return (
      <span className={classes} style={style} title={line.plain}>
        <TransactionTypeIcon type={input.type} />
        <span className="tx-line-dot" aria-hidden="true" />
        <span className="tx-line-action">{line.action}</span>
        {line.suffix ? <span className="tx-line-suffix">{line.suffix}</span> : null}
      </span>
    );
  }

  return (
    <span className={classes} style={style} title={line.plain}>
      <TransactionTypeIcon type={input.type} />
      <span className="tx-line-dot" aria-hidden="true" />
      <span className="tx-line-who">{line.who}</span>{" "}
      <span className="tx-line-action">{line.action}</span>
      {isExchange && !hideAmounts ? (
        <>
          {" "}
          <span className="tx-amt tx-amt-out">
            {line.amounts[0].amount}
            {line.amounts[0].currency ? ` ${line.amounts[0].currency}` : ""}
          </span>
          <span className="tx-line-arrow"> → </span>
          <span className="tx-amt tx-amt-in">
            {line.amounts[1].amount}
            {line.amounts[1].currency ? ` ${line.amounts[1].currency}` : ""}
          </span>
        </>
      ) : !hideAmounts && line.amounts.length > 0 ? (
        <>
          {" "}
          {line.amounts.map((p, i) => (
            <span key={`${p.sign}-${p.currency}-${p.amount}-${i}`}>
              {i > 0 ? <span className="tx-line-sep"> · </span> : null}
              <span
                className={
                  p.sign === "+" ? "tx-amt tx-amt-in" : "tx-amt tx-amt-out"
                }
              >
                {fmtAmountPart(p)}
              </span>
            </span>
          ))}
        </>
      ) : null}
      {line.suffix ? <span className="tx-line-suffix">{line.suffix}</span> : null}
    </span>
  );
}
