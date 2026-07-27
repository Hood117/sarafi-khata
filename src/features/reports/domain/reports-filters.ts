import type { TransactionType } from "@/generated/prisma/client";

import { isTransactionType } from "@/features/transactions/domain/transaction-rules";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applied (normalized) report filters from URL search params.
 * Date fields use `YYYY-MM-DD` calendar strings (same as customer history).
 */
export type ReportsFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  customerId: string | null;
  currencyCode: string | null;
  type: TransactionType | null;
  operatorId: string | null;
};

export type ReportsFilterHrefInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  customerId?: string | null;
  currencyCode?: string | null;
  type?: string | null;
  operatorId?: string | null;
};

export type ReportsFilterSearchParams = {
  from?: string | string[];
  to?: string | string[];
  customerId?: string | string[];
  currency?: string | string[];
  type?: string | string[];
  operator?: string | string[];
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

export function normalizeReportsFilters(
  input: ReportsFilterHrefInput = {},
): ReportsFilters {
  let dateFrom = normalizeDateOnly(input.dateFrom ?? undefined);
  let dateTo = normalizeDateOnly(input.dateTo ?? undefined);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swapped = dateFrom;
    dateFrom = dateTo;
    dateTo = swapped;
  }

  const typeRaw = input.type?.trim();
  const type =
    typeRaw && isTransactionType(typeRaw) ? (typeRaw as TransactionType) : null;

  const currencyCode =
    typeof input.currencyCode === "string" && input.currencyCode.trim()
      ? input.currencyCode.trim().toUpperCase()
      : null;

  const customerId =
    typeof input.customerId === "string" && input.customerId.trim()
      ? input.customerId.trim()
      : null;

  const operatorId =
    typeof input.operatorId === "string" && input.operatorId.trim()
      ? input.operatorId.trim()
      : null;

  return {
    dateFrom,
    dateTo,
    customerId,
    currencyCode,
    type,
    operatorId,
  };
}

export function parseReportsFiltersFromSearchParams(
  params: ReportsFilterSearchParams,
): ReportsFilters {
  return normalizeReportsFilters({
    dateFrom: firstValue(params.from),
    dateTo: firstValue(params.to),
    customerId: firstValue(params.customerId),
    currencyCode: firstValue(params.currency),
    type: firstValue(params.type),
    operatorId: firstValue(params.operator),
  });
}

export function hasActiveReportsFilters(filters: ReportsFilters): boolean {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.customerId ||
      filters.currencyCode ||
      filters.type ||
      filters.operatorId,
  );
}

export function hasCustomDateRange(filters: ReportsFilters): boolean {
  return Boolean(filters.dateFrom || filters.dateTo);
}

/**
 * Builds a reports URL (`/reports` or a drill-in path) preserving filters.
 */
export function buildReportsHref(
  input: ReportsFilterHrefInput = {},
  pathname: string = "/reports",
): string {
  const filters = normalizeReportsFilters(input);
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set("from", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("to", filters.dateTo);
  }
  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }
  if (filters.currencyCode) {
    params.set("currency", filters.currencyCode);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.operatorId) {
    params.set("operator", filters.operatorId);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Formats a Date as local `YYYY-MM-DD`. */
export function toLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts a half-open [start, end) period into inclusive from/to date filters.
 */
export function inclusiveDateFiltersFromBounds(
  start: Date,
  endExclusive: Date,
): { dateFrom: string; dateTo: string } {
  const inclusiveEnd = new Date(endExclusive);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  return {
    dateFrom: toLocalDateOnly(start),
    dateTo: toLocalDateOnly(inclusiveEnd),
  };
}

/** Local calendar start of a `YYYY-MM-DD` day. */
export function localDateOnlyStart(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

/** Local calendar exclusive end (start of next day). */
export function localDateOnlyEndExclusive(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year!, month! - 1, day! + 1);
}

/**
 * Resolve half-open valueDate bounds from optional from/to filters.
 * When both absent, returns null (caller uses calendar day/month defaults).
 */
export function resolveFilterDateBounds(
  filters: ReportsFilters,
): { start: Date; end: Date; label: string } | null {
  if (!filters.dateFrom && !filters.dateTo) {
    return null;
  }

  const start = filters.dateFrom
    ? localDateOnlyStart(filters.dateFrom)
    : new Date(1970, 0, 1);
  const end = filters.dateTo
    ? localDateOnlyEndExclusive(filters.dateTo)
    : new Date(2100, 0, 1);

  const label =
    filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} → ${filters.dateTo}`
      : filters.dateFrom
        ? `From ${filters.dateFrom}`
        : `Through ${filters.dateTo}`;

  return { start, end, label };
}
