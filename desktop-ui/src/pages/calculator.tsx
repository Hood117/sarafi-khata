import { useEffect, useMemo, useState } from "react";

import {
  listCurrenciesPage,
  listCurrencyDenominations,
  type CurrencyDenominationRow,
  type CurrencyListItem,
} from "@desktop/api";
import { IconCash } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { CurrencyPicker } from "@desktop/ui/currency-picker";

type Line = {
  id: string;
  label: string;
  value: number;
  qty: number;
};

const FALLBACK: Record<string, Array<{ label: string; value: number }>> = {
  AFN: [
    { label: "1000", value: 1000 },
    { label: "500", value: 500 },
    { label: "100", value: 100 },
    { label: "50", value: 50 },
    { label: "20", value: 20 },
    { label: "10", value: 10 },
  ],
  USD: [
    { label: "100", value: 100 },
    { label: "50", value: 50 },
    { label: "20", value: 20 },
    { label: "10", value: 10 },
    { label: "5", value: 5 },
    { label: "1", value: 1 },
  ],
  AED: [
    { label: "1000", value: 1000 },
    { label: "500", value: 500 },
    { label: "200", value: 200 },
    { label: "100", value: 100 },
    { label: "50", value: 50 },
    { label: "20", value: 20 },
    { label: "10", value: 10 },
    { label: "5", value: 5 },
  ],
};

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function linesFromDenoms(denoms: CurrencyDenominationRow[]): Line[] {
  return denoms
    .filter((d) => d.isActive)
    .slice()
    .sort((a, b) => Number(b.value) - Number(a.value) || a.sortOrder - b.sortOrder)
    .map((d) => ({
      id: d.id,
      label: d.label,
      value: Number(d.value) || 0,
      qty: 0,
    }));
}

function linesFromFallback(code: string): Line[] {
  const list = FALLBACK[code.toUpperCase()] ?? FALLBACK.AFN;
  return list.map((d) => ({
    id: `fb-${code}-${d.value}`,
    label: d.label,
    value: d.value,
    qty: 0,
  }));
}

/**
 * Cash-count calculator — enter how many notes of each denomination.
 * Example: 5×100 + 10×1000 + 20×500 → live total.
 */
export function CalculatorPage() {
  const t = useT();
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [currency, setCurrency] = useState("AFN");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => {
        if (cancelled) return;
        setCurrencies(page.items);
        const preferred = pickDefaultCurrency(page.items);
        setCurrency((prev) =>
          page.items.some((c) => c.code === prev) ? prev : preferred,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listCurrencyDenominations(currency)
      .then((denoms) => {
        if (cancelled) return;
        const next =
          denoms.length > 0 ? linesFromDenoms(denoms) : linesFromFallback(currency);
        setLines(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLines(linesFromFallback(currency));
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.value * line.qty, 0),
    [lines],
  );

  const breakdown = useMemo(
    () =>
      lines
        .filter((l) => l.qty > 0)
        .map((l) => `${l.qty} × ${l.label}`)
        .join("  +  "),
    [lines],
  );

  const noteCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  function setQty(id: string, qty: number) {
    const next = Math.max(0, Math.min(999_999, Math.floor(qty)));
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: next } : l)));
  }

  function bump(id: string, delta: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
      ),
    );
  }

  function clearAll() {
    setLines((prev) => prev.map((l) => ({ ...l, qty: 0 })));
  }

  return (
    <div className="stack calculator-page page-column">
      {error && lines.length === 0 ? <p className="error">{error}</p> : null}
      {busy && lines.length === 0 ? <p className="muted">{t.common.loading}</p> : null}

      <div className="calculator-result card">
        <div className="calculator-result-icon" aria-hidden>
          <IconCash />
        </div>
        <div className="calculator-result-body">
          <div className="muted calculator-result-label">{t.calculator.total}</div>
          <div className="calculator-result-value">
            {formatMoney(total)}{" "}
            <span className="calculator-result-ccy">{currency}</span>
          </div>
          <div className="muted calculator-result-meta">
            {noteCount === 0
              ? t.calculator.emptyBreakdown
              : `${breakdown}  =  ${formatMoney(total)} ${currency}`}
          </div>
        </div>
        <CurrencyPicker
          className="calculator-currency"
          label={t.common.currency}
          hideLabel
          currencies={currencies}
          value={currency}
          onChange={setCurrency}
          emptyLabel={t.common.noData}
          searchPlaceholder={t.common.search}
          allowManage={false}
        />
        <button type="button" className="secondary" onClick={clearAll} disabled={noteCount === 0}>
          {t.calculator.clear}
        </button>
      </div>

      <div className="calculator-grid">
        {lines.map((line) => {
          const sub = line.value * line.qty;
          return (
            <article key={line.id} className="calculator-note card">
              <div className="calculator-note-face">
                <span className="calculator-note-value">{line.label}</span>
                <span className="muted calculator-note-unit">
                  {t.calculator.each.replace("{amount}", formatMoney(line.value))}
                </span>
              </div>
              <div className="calculator-note-qty">
                <button
                  type="button"
                  className="secondary calculator-step"
                  aria-label={t.calculator.minus}
                  onClick={() => bump(line.id, -1)}
                  disabled={line.qty <= 0}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={line.qty}
                  onChange={(e) => setQty(line.id, Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  aria-label={`${line.label} ${t.desk.quantity}`}
                />
                <button
                  type="button"
                  className="secondary calculator-step"
                  aria-label={t.calculator.plus}
                  onClick={() => bump(line.id, 1)}
                >
                  +
                </button>
              </div>
              <div className="calculator-note-sub">
                <span className="muted">{t.desk.subtotal}</span>
                <strong>
                  {formatMoney(sub)} {currency}
                </strong>
              </div>
            </article>
          );
        })}
      </div>

      {lines.length === 0 && !busy ? (
        <p className="muted">{t.desk.noDenominations.replace("{currency}", currency)}</p>
      ) : null}
    </div>
  );
}
