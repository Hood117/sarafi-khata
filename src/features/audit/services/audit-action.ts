import "server-only";

import type { RecordAuditEventInput } from "@/features/audit/domain/types";
import { getRequestIpAddress } from "@/features/audit/services/get-request-ip-address";
import { recordAuditEvent } from "@/features/audit/services/record-audit-event";

/**
 * Server Action integration helper.
 *
 * Fills request IP when omitted, then delegates to {@link recordAuditEvent}.
 * Never throws — safe to await after primary mutations without try/catch.
 */
export async function auditAction(
  input: Omit<RecordAuditEventInput, "ipAddress"> & {
    ipAddress?: string | null;
  },
): Promise<void> {
  try {
    const ipAddress =
      input.ipAddress !== undefined
        ? input.ipAddress
        : await getRequestIpAddress();

    await recordAuditEvent({
      ...input,
      ipAddress,
    });
  } catch (error) {
    // Defense in depth: IP resolution or unexpected failures must not
    // surface to callers after a successful business mutation (e.g. logout).
    console.error("[audit] auditAction failed", error);
  }
}
