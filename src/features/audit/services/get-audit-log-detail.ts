import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { AuditError } from "@/features/audit/domain/errors";
import {
  buildAuditSummary,
  formatAuditEntityLabel,
} from "@/features/audit/domain/format";
import {
  labelForAuditAction,
  labelForAuditModule,
} from "@/features/audit/domain/labels";
import type {
  AuditLogDetail,
  AuditValues,
} from "@/features/audit/domain/types";
import { findAuditLogById } from "@/features/audit/repositories/audit-log-repository";
import { prisma } from "@/server/db";

function toAuditValues(value: unknown): AuditValues | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditValues;
}

/**
 * Read-only Audit Log detail for the UI.
 * Never writes ledger or audit rows.
 */
export async function getAuditLogDetail(id: string): Promise<AuditLogDetail> {
  await requirePermission("audit.view");

  const trimmedId = id.trim();
  if (!trimmedId) {
    throw new AuditError("NOT_FOUND", "Audit event was not found.");
  }

  const row = await findAuditLogById(trimmedId);

  if (!row) {
    throw new AuditError("NOT_FOUND", "Audit event was not found.");
  }

  const beforeValues = toAuditValues(row.beforeValues);
  const afterValues = toAuditValues(row.afterValues);

  let userName: string | null = null;
  if (row.userId) {
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { fullName: true, username: true },
    });
    userName = user
      ? user.fullName.trim() || user.username
      : null;
  }

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
    userName,
    module: row.module,
    moduleLabel: labelForAuditModule(row.module),
    action: row.action,
    actionLabel: labelForAuditAction(row.action),
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: formatAuditEntityLabel(row.entityType, row.entityId),
    ipAddress: row.ipAddress,
    summary: buildAuditSummary({
      action: row.action,
      beforeValues,
      afterValues,
    }),
    beforeValues,
    afterValues,
  };
}
