/** Day Total helpers — sums the full filtered journal set (not a pagination page). */

export type DaybookTotalLine = {
  debit?: string | null;
  credit?: string | null;
  balanceAfter?: string | null;
  currencyCode?: string | null;
};

export type JournalCurrencyTotal = { code: string; amount: string };

export type JournalFilterTotals = {
  debit: JournalCurrencyTotal[];
  credit: JournalCurrencyTotal[];
  closing: JournalCurrencyTotal[];
};

function parseMoney(value: string): number {
  const n = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatAmountDisplay(raw: string): string {
  const n = parseMoney(raw);
  const formatted = formatMoney(n);
  const [intPart, frac] = formatted.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${withCommas}.${frac}` : withCommas;
}

/**
 * Debit/credit sums of every line in `lines`; closing is the last running cash
 * per currency (never summed across currencies).
 */
export function journalFilterTotals(lines: DaybookTotalLine[]): JournalFilterTotals {
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  const closing = new Map<string, string>();
  const order: string[] = [];
  for (const line of lines) {
    const code = (line.currencyCode || "").trim().toUpperCase();
    if (!code) continue;
    if (!order.includes(code)) order.push(code);
    const d = parseMoney(line.debit ?? "");
    const c = parseMoney(line.credit ?? "");
    if (d) debit.set(code, (debit.get(code) ?? 0) + d);
    if (c) credit.set(code, (credit.get(code) ?? 0) + c);
    if (line.balanceAfter) closing.set(code, line.balanceAfter);
  }
  const fromSums = (map: Map<string, number>) =>
    order
      .filter((code) => (map.get(code) ?? 0) !== 0)
      .map((code) => ({
        code,
        amount: formatAmountDisplay(String(map.get(code))),
      }));
  return {
    debit: fromSums(debit),
    credit: fromSums(credit),
    closing: order
      .filter((code) => closing.has(code))
      .map((code) => ({ code, amount: closing.get(code) ?? "" })),
  };
}

export const EMPTY_JOURNAL_FILTER_TOTALS: JournalFilterTotals = {
  debit: [],
  credit: [],
  closing: [],
};
