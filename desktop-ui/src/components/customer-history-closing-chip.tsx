import { useLayoutEffect, useRef } from "react";

import { moneyToneClass } from "@desktop/lib/currency-labels";
import {
  animateClosingBalanceChange,
  motionOk,
} from "@desktop/lib/motion";
import { CurrencyFlag } from "@desktop/ui/currency-flag";

function parseMoneyDisplay(value: string): number {
  const n = Number.parseFloat(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/−/g, "-")
      .trim(),
  );
  return Number.isFinite(n) ? n : 0;
}

type CustomerHistoryClosingChipProps = {
  currencyCode: string;
  balanceDisplay: string;
  sideLabel: string | null;
};

/** Footer balance pill — smooth amount tween + light zoom pulse on change. */
export function CustomerHistoryClosingChip({
  currencyCode,
  balanceDisplay,
  sideLabel,
}: CustomerHistoryClosingChipProps) {
  const chipRef = useRef<HTMLSpanElement>(null);
  const amountRef = useRef<HTMLSpanElement>(null);
  const prevDisplayRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const amountEl = amountRef.current;
    if (!amountEl) return;

    const prev = prevDisplayRef.current;
    prevDisplayRef.current = balanceDisplay;

    if (prev == null) {
      amountEl.textContent = balanceDisplay;
      return;
    }
    if (prev === balanceDisplay) return;

    if (
      !motionOk() ||
      parseMoneyDisplay(prev) === parseMoneyDisplay(balanceDisplay)
    ) {
      amountEl.textContent = balanceDisplay;
      return;
    }

    animateClosingBalanceChange({
      chip: chipRef.current,
      amountEl,
      fromDisplay: prev,
      toDisplay: balanceDisplay,
    });
  }, [balanceDisplay]);

  return (
    <span
      ref={chipRef}
      className={`customer-history-closing-chip ${moneyToneClass(balanceDisplay)}`}
      title={`${currencyCode} ${balanceDisplay}`}
      aria-label={`${currencyCode} ${balanceDisplay}${sideLabel ? ` ${sideLabel}` : ""}`}
    >
      <CurrencyFlag code={currencyCode} size="sm" />
      <span className="customer-history-closing-money" dir="ltr">
        <span className="customer-history-closing-code">{currencyCode}</span>
        <span ref={amountRef} className="customer-history-closing-amount" />
      </span>
      {sideLabel ? (
        <span className="customer-money-side">{sideLabel}</span>
      ) : null}
    </span>
  );
}
