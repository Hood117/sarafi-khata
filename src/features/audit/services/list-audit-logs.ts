import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  normalizeAuditFilters,
  type AuditFilterOptions,
} from "@/features/audit/domain/audit-filters";
import {
  formatAuditEntityLabel,
  buildAuditSummary,
} from "@/features/audit/domain/format";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  labelForAuditAction,
  labelForAuditModule,
} from "@/features/audit/domain/labels";
import type {
  AuditLogListItem,
  AuditLogListResult,
  AuditValues,
  GetAuditLogListOptions,
} from "@/features/audit/domain/types";
import {
  countAuditLogs,
  listAuditLogs,
} from "@/features/audit/repositories/audit-log-repository";
import { prisma } from "@/server/db";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function normalizePage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE;
  }

  return Math.floor(value);
}

function normalizePageSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

function toAuditValues(value: unknown): AuditValues | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditValues;
}

async function loadAuditFilterOptions(): Promise<AuditFilterOptions> {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, username: true },
    orderBy: { fullName: "asc" },
  });

  return {
    users: users.map((user) => ({
      id: user.id,
      label: user.fullName.trim() || user.username,
    })),
    modules: Object.entries(AUDIT_MODULE_LABELS)
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    actions: Object.entries(AUDIT_ACTION_LABELS)
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

/**
 * Read-only Audit Log list for the UI.
 * Filters are applied in SQL (indexed equality + date range); never loads all rows.
 */
export async function getAuditLogList(
  options: GetAuditLogListOptions = {},
): Promise<AuditLogListResult> {
  await requirePermission("audit.view");

  const filters = normalizeAuditFilters({
    search: options.search,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    userId: options.userId,
    module: options.module,
    action: options.action,
  });

  const pageSize = normalizePageSize(options.pageSize);
  let page = normalizePage(options.page);

  const [total, filterOptions] = await Promise.all([
    countAuditLogs({ filters }),
    loadAuditFilterOptions(),
  ]);

  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  if (page > totalPages) {
    page = totalPages;
  }

  const skip = (page - 1) * pageSize;
  const rows = await listAuditLogs({
    filters,
    skip,
    take: pageSize,
  });

  const userIds = [
    ...new Set(
      rows
        .map((row) => row.userId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, username: true },
        })
      : [];

  const userNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const items: AuditLogListItem[] = rows.map((row) => {
    const afterValues = toAuditValues(row.afterValues);
    const beforeValues = toAuditValues(row.beforeValues);

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userName: row.userId ? (userNames.get(row.userId) ?? null) : null,
      module: row.module,
      moduleLabel: labelForAuditModule(row.module),
      action: row.action,
      actionLabel: labelForAuditAction(row.action),
      entityLabel: formatAuditEntityLabel(row.entityType, row.entityId),
      summary: buildAuditSummary({
        action: row.action,
        beforeValues,
        afterValues,
      }),
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    filters,
    filterOptions,
  };
}
