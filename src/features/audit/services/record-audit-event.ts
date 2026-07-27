import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { RecordAuditEventInput } from "@/features/audit/domain/types";
import { createAuditLog } from "@/features/audit/repositories/audit-log-repository";
import { recordAuditEventSchema } from "@/features/audit/schemas/record-audit-event";

function toJsonValue(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  try {
    // Ensure the payload is JSON-serializable before handing it to Prisma.
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return null;
  }
}

/**
 * Record a system activity event.
 *
 * Safe for every module to call after a primary operation:
 * - Does not modify business data
 * - Never throws — validation/persistence failures are logged and swallowed
 * - Awaiting is safe; a failed audit write still resolves without rejecting
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
): Promise<void> {
  try {
    const parsed = recordAuditEventSchema.safeParse(input);

    if (!parsed.success) {
      console.error("[audit] skipped invalid audit event", parsed.error.flatten());
      return;
    }

    const data = parsed.data;

    await createAuditLog({
      userId: data.userId ?? null,
      action: data.action,
      module: data.module,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      ipAddress: data.ipAddress ?? null,
      beforeValues: toJsonValue(data.beforeValues),
      afterValues: toJsonValue(data.afterValues),
    });
  } catch (error) {
    console.error("[audit] failed to record audit event", error);
  }
}
