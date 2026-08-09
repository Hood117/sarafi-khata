/**
 * Local calendar-day bounds for dashboard “today” filters.
 * Half-open interval: valueDate >= start && valueDate < end.
 */
export function localCalendarDayBounds(now: Date): {
  start: Date;
  end: Date;
  dateOnly: string;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return {
    start,
    end,
    dateOnly: `${now.getFullYear()}-${month}-${day}`,
  };
}

/**
 * Local calendar-month bounds (half-open: start inclusive, end exclusive).
 */
export function localCalendarMonthBounds(now: Date): {
  start: Date;
  end: Date;
  label: string;
  monthKey: string;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return {
    start,
    end,
    label: new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
    }).format(now),
    monthKey: `${now.getFullYear()}-${month}`,
  };
}

export function normalizeRecentLimit(value: number | undefined): number {
  const DEFAULT = 10;
  const MAX = 50;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT;
  }

  return Math.min(Math.floor(value), MAX);
}

export function countTodayByType(
  types: readonly { type: string; count: number }[],
): {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
} {
  let transactions = 0;
  let deposits = 0;
  let withdrawals = 0;
  let exchanges = 0;
  let hawala = 0;
  let transfers = 0;

  for (const group of types) {
    const count = group.count;
    transactions += count;

    switch (group.type) {
      case "DEPOSIT":
        deposits += count;
        break;
      case "WITHDRAWAL":
        withdrawals += count;
        break;
      case "EXCHANGE":
        exchanges += count;
        break;
      case "HAWALA":
        hawala += count;
        break;
      case "TRANSFER":
        transfers += count;
        break;
      default:
        break;
    }
  }

  return {
    transactions,
    deposits,
    withdrawals,
    exchanges,
    hawala,
    transfers,
  };
}
