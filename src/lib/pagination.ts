/**
 * Shared list pagination helpers (SQL skip/take).
 * Keep desk lists consistent — do not reimplement clamps per feature.
 */

export const DEFAULT_LIST_PAGE_SIZE = 25;
export const MAX_LIST_PAGE_SIZE = 100;

export type ListPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizePage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export function normalizePageSize(
  value: number | undefined,
  fallback: number = DEFAULT_LIST_PAGE_SIZE,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(MAX_LIST_PAGE_SIZE, Math.floor(value));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  return Math.min(page, totalPages);
}

export function paginationSkip(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
