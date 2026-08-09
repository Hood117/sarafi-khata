import type { TransactionType } from "@/generated/prisma/client";

import { localCalendarDayBounds } from "@/features/dashboard/domain/dashboard-stats";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DailyBookFilters = {
  date: string;
  type: TransactionType | null;
  customerId: string | null;
  currencyCode: string | null;
};

export type DailyBookFilterHrefInput = {
  date?: string | null;
  type?: string | null;
  customerId?: string | null;
  currencyCode?: string | null;
};

export type DailyBookFilterSearchParams = {
  date?: string | string[];
  type?: string | string[];
  customerId?: string | string[];
  currency?: string | string[];
};

export type DailyBookCustomerOption = {
  id: string;
  label: string;
};

export type DailyBookCurrencyOption = {
  code: string;
  label: string;
  symbol?: string | null;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeDateOnly(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return trimmed;
}

export function todayDateOnly(now = new Date()): string {
  return localCalendarDayBounds(now).dateOnly;
}

export function normalizeDailyBookFilters(
  input: DailyBookFilterHrefInput = {},
  now = new Date(),
): DailyBookFilters {
  const date = normalizeDateOnly(input.date ?? undefined) ?? todayDateOnly(now);

  const typeRaw = input.type?.trim();
  const type =
    typeRaw && typeRaw in TRANSACTION_TYPE_LABELS
      ? (typeRaw as TransactionType)
      : null;

  const customerId =
    typeof input.customerId === "string" && input.customerId.trim()
      ? input.customerId.trim()
      : null;

  const currencyCode =
    typeof input.currencyCode === "string" && input.currencyCode.trim()
      ? input.currencyCode.trim().toUpperCase()
      : null;

  return { date, type, customerId, currencyCode };
}

export function parseDailyBookFiltersFromSearchParams(
  params: DailyBookFilterSearchParams,
  now = new Date(),
): DailyBookFilters {
  return normalizeDailyBookFilters(
    {
      date: firstValue(params.date),
      type: firstValue(params.type),
      customerId: firstValue(params.customerId),
      currencyCode: firstValue(params.currency),
    },
    now,
  );
}

export function hasActiveDailyBookFilters(filters: DailyBookFilters): boolean {
  const isToday = filters.date === todayDateOnly();
  return Boolean(
    filters.type || filters.customerId || filters.currencyCode || !isToday,
  );
}

export function dayBoundsForDateOnly(dateOnly: string): {
  start: Date;
  end: Date;
} {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const start = new Date(year!, month! - 1, day!);
  const end = new Date(year!, month! - 1, day! + 1);
  return { start, end };
}

export function buildDailyBookHref(input: DailyBookFilterHrefInput = {}): string {
  const filters = normalizeDailyBookFilters(input);
  const params = new URLSearchParams();
  const today = todayDateOnly();

  if (filters.date !== today) {
    params.set("date", filters.date);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }
  if (filters.currencyCode) {
    params.set("currency", filters.currencyCode);
  }

  const query = params.toString();
  return query ? `/daily-book?${query}` : "/daily-book";
}
