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

export function normalizeRecentLimit(value: number | undefined): number {
  const DEFAULT = 10;
  const MAX = 50;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT;
  }

  return Math.min(Math.floor(value), MAX);
}

export function countTodayByType(
  types: readonly string[],
): {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
} {
  let deposits = 0;
  let withdrawals = 0;
  let exchanges = 0;
  let hawala = 0;
  let transfers = 0;

  for (const type of types) {
    switch (type) {
      case "DEPOSIT":
        deposits += 1;
        break;
      case "WITHDRAWAL":
        withdrawals += 1;
        break;
      case "EXCHANGE":
        exchanges += 1;
        break;
      case "HAWALA":
        hawala += 1;
        break;
      case "TRANSFER":
        transfers += 1;
        break;
      default:
        break;
    }
  }

  return {
    transactions: types.length,
    deposits,
    withdrawals,
    exchanges,
    hawala,
    transfers,
  };
}
