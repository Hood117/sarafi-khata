import "server-only";

import { Prisma, type AuditLog } from "@/generated/prisma/client";
import {
  localDateOnlyEndExclusive,
  localDateOnlyStart,
  type AuditFilters,
} from "@/features/audit/domain/audit-filters";
import { prisma } from "@/server/db";

export type CreateAuditLogData = {
  userId?: string | null;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  beforeValues?: Prisma.InputJsonValue | null;
  afterValues?: Prisma.InputJsonValue | null;
};

export type ListAuditLogsOptions = {
  filters?: Partial<AuditFilters>;
  skip?: number;
  take?: number;
};

function toNullableJsonInput(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value;
}

/**
 * Builds an index-friendly Prisma where clause.
 * Equality filters use composite indexes with createdAt; search is optional OR.
 */
export function buildAuditLogWhere(
  filters: Partial<AuditFilters> = {},
): Prisma.AuditLogWhereInput {
  const search = filters.search?.trim() ?? "";
  const clauses: Prisma.AuditLogWhereInput[] = [];

  if (filters.userId) {
    clauses.push({ userId: filters.userId });
  }

  if (filters.module) {
    clauses.push({ module: filters.module });
  }

  if (filters.action) {
    clauses.push({ action: filters.action });
  }

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};

    if (filters.dateFrom) {
      createdAt.gte = localDateOnlyStart(filters.dateFrom);
    }

    if (filters.dateTo) {
      createdAt.lt = localDateOnlyEndExclusive(filters.dateTo);
    }

    clauses.push({ createdAt });
  }

  if (search) {
    clauses.push({
      OR: [
        { action: { contains: search } },
        { module: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
        { ipAddress: { contains: search } },
        {
          user: {
            OR: [
              { fullName: { contains: search } },
              { username: { contains: search } },
            ],
          },
        },
      ],
    });
  }

  if (clauses.length === 0) {
    return {};
  }

  if (clauses.length === 1) {
    return clauses[0]!;
  }

  return { AND: clauses };
}

/**
 * Persist a single append-only audit row.
 * Callers outside this feature should use `recordAuditEvent` instead.
 */
export async function createAuditLog(
  data: CreateAuditLogData,
): Promise<AuditLog> {
  return prisma.auditLog.create({
    data: {
      userId: data.userId ?? null,
      action: data.action,
      module: data.module,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      ipAddress: data.ipAddress ?? null,
      beforeValues: toNullableJsonInput(data.beforeValues),
      afterValues: toNullableJsonInput(data.afterValues),
    },
  });
}

export async function countAuditLogs(
  options: Pick<ListAuditLogsOptions, "filters"> = {},
): Promise<number> {
  return prisma.auditLog.count({
    where: buildAuditLogWhere(options.filters),
  });
}

export async function listAuditLogs(
  options: ListAuditLogsOptions = {},
): Promise<AuditLog[]> {
  const take =
    typeof options.take === "number" && options.take > 0
      ? options.take
      : undefined;
  const skip =
    typeof options.skip === "number" && options.skip > 0
      ? options.skip
      : undefined;

  return prisma.auditLog.findMany({
    where: buildAuditLogWhere(options.filters),
    orderBy: { createdAt: "desc" },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });
}

export async function findAuditLogById(id: string): Promise<AuditLog | null> {
  return prisma.auditLog.findUnique({
    where: { id },
  });
}
