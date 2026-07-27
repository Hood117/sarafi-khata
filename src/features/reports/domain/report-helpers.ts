import { countTodayByType } from "@/features/dashboard/domain/dashboard-stats";
import type { ReportActivityCounts } from "@/features/reports/domain/types";

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

export function normalizeTableLimit(value: number | undefined): number {
  const DEFAULT = 15;
  const MAX = 50;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT;
  }

  return Math.min(Math.floor(value), MAX);
}

export function toActivityCounts(types: readonly string[]): ReportActivityCounts {
  const base = countTodayByType(types);
  let adjustments = 0;

  for (const type of types) {
    if (type === "ADJUSTMENT") {
      adjustments += 1;
    }
  }

  return {
    ...base,
    adjustments,
  };
}

export function isIsoInPeriod(
  isoDate: string,
  start: Date,
  end: Date,
): boolean {
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return time >= start.getTime() && time < end.getTime();
}

/** Parses major-unit display amounts from formatPrismaAmount (no grouping). */
export function parseMajorAmountDisplay(display: string): number | null {
  const trimmed = display.trim();
  if (!trimmed || trimmed === "—") {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function formatMajorTotal(total: number): string {
  if (!Number.isFinite(total)) {
    return "—";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 8,
  }).format(total);
}

export function takeLatestByDate<T extends { valueDate: string }>(
  items: readonly T[],
  limit: number,
): T[] {
  return [...items]
    .sort((left, right) => right.valueDate.localeCompare(left.valueDate))
    .slice(0, limit);
}
