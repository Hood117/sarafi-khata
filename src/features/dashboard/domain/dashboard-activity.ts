import type { TransactionType } from "@/generated/prisma/client";

import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";

export type DashboardDailyPoint = {
  date: string;
  dayLabel: string;
  count: number;
};

export type DashboardTypeShare = {
  type: TransactionType | "OTHER";
  label: string;
  count: number;
};

/**
 * Build a day-by-day posted count series for the current calendar month.
 */
export function buildMonthlyDailySeries(
  rows: readonly { valueDate: Date; type: TransactionType }[],
  monthStart: Date,
  monthEnd: Date,
): DashboardDailyPoint[] {
  const counts = new Map<string, number>();
  const cursor = new Date(monthStart);

  while (cursor < monthEnd) {
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    const key = `${cursor.getFullYear()}-${month}-${day}`;
    counts.set(key, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const row of rows) {
    const value = row.valueDate;
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const key = `${value.getFullYear()}-${month}-${day}`;
    if (!counts.has(key)) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([date, count]) => ({
    date,
    dayLabel: String(Number(date.slice(-2))),
    count,
  }));
}

/**
 * Build type mix for the month chart legend / stacked share bars.
 */
export function buildMonthlyTypeShares(
  rows: readonly { type: TransactionType }[],
): DashboardTypeShare[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }

  const order: TransactionType[] = [
    "HAWALA",
    "EXCHANGE",
    "TRANSFER",
    "DEPOSIT",
    "WITHDRAWAL",
    "ADJUSTMENT",
  ];

  const shares: DashboardTypeShare[] = [];
  for (const type of order) {
    const count = counts.get(type) ?? 0;
    if (count <= 0) continue;
    shares.push({
      type,
      label: TRANSACTION_TYPE_LABELS[type],
      count,
    });
    counts.delete(type);
  }

  for (const [type, count] of counts) {
    if (count <= 0) continue;
    shares.push({
      type: type as TransactionType,
      label: TRANSACTION_TYPE_LABELS[type as TransactionType] ?? type,
      count,
    });
  }

  return shares;
}
