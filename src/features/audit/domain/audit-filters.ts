import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
} from "@/features/audit/domain/constants";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const KNOWN_MODULES = new Set<string>(Object.values(AUDIT_MODULES));
const KNOWN_ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));

/**
 * Applied (normalized) audit list filters from URL search params.
 * Date fields use `YYYY-MM-DD` calendar strings (same as reports).
 */
export type AuditFilters = {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  userId: string | null;
  module: string | null;
  action: string | null;
};

export type AuditFilterHrefInput = {
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  userId?: string | null;
  module?: string | null;
  action?: string | null;
  page?: number | null;
};

export type AuditFilterSearchParams = {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  user?: string | string[];
  module?: string | string[];
  action?: string | string[];
  page?: string | string[];
};

export type AuditFilterOption = {
  value: string;
  label: string;
};

export type AuditFilterUserOption = {
  id: string;
  label: string;
};

export type AuditFilterOptions = {
  users: AuditFilterUserOption[];
  modules: AuditFilterOption[];
  actions: AuditFilterOption[];
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

export function normalizeAuditFilters(
  input: AuditFilterHrefInput = {},
): AuditFilters {
  let dateFrom = normalizeDateOnly(input.dateFrom ?? undefined);
  let dateTo = normalizeDateOnly(input.dateTo ?? undefined);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swapped = dateFrom;
    dateFrom = dateTo;
    dateTo = swapped;
  }

  const search =
    typeof input.search === "string" ? input.search.trim() : "";

  const userId =
    typeof input.userId === "string" && input.userId.trim()
      ? input.userId.trim()
      : null;

  const moduleRaw =
    typeof input.module === "string" ? input.module.trim() : "";
  const moduleValue =
    moduleRaw && KNOWN_MODULES.has(moduleRaw) ? moduleRaw : null;

  const actionRaw =
    typeof input.action === "string" ? input.action.trim() : "";
  const action =
    actionRaw && KNOWN_ACTIONS.has(actionRaw) ? actionRaw : null;

  return {
    search,
    dateFrom,
    dateTo,
    userId,
    module: moduleValue,
    action,
  };
}

export function parseAuditFiltersFromSearchParams(
  params: AuditFilterSearchParams,
): AuditFilters {
  return normalizeAuditFilters({
    search: firstValue(params.q),
    dateFrom: firstValue(params.from),
    dateTo: firstValue(params.to),
    userId: firstValue(params.user),
    module: firstValue(params.module),
    action: firstValue(params.action),
  });
}

export function parseAuditPageFromSearchParams(
  params: AuditFilterSearchParams,
): number | undefined {
  const raw = firstValue(params.page).trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function hasActiveAuditFilters(filters: AuditFilters): boolean {
  return Boolean(
    filters.search ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.userId ||
      filters.module ||
      filters.action,
  );
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
 * Builds an audit list URL preserving filters and optional page.
 */
export function buildAuditHref(input: AuditFilterHrefInput = {}): string {
  const filters = normalizeAuditFilters(input);
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("q", filters.search);
  }
  if (filters.dateFrom) {
    params.set("from", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("to", filters.dateTo);
  }
  if (filters.userId) {
    params.set("user", filters.userId);
  }
  if (filters.module) {
    params.set("module", filters.module);
  }
  if (filters.action) {
    params.set("action", filters.action);
  }

  const page =
    typeof input.page === "number" && Number.isFinite(input.page)
      ? Math.floor(input.page)
      : 1;
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}
