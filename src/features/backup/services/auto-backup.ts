import "server-only";

import { createVerifiedBackup } from "@/features/backup/services/backup-engine";

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingReason = "auto";
let inFlight: Promise<void> | null = null;

/**
 * Debounced automatic backup after data changes.
 * Failures are logged; callers are not blocked.
 */
export function queueAutoBackup(reason = "auto") {
  pendingReason = reason;
  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = null;
    const reasonToUse = pendingReason;
    inFlight = (async () => {
      const result = await createVerifiedBackup(reasonToUse);
      if (!result.ok) {
        console.error(`[backup] AUTO BACKUP FAILED: ${result.message}`, result.details);
      } else if (result.warnings.length > 0) {
        console.warn(
          `[backup] Auto backup completed with warnings (${result.stamp})`,
          result.warnings,
        );
      } else {
        console.info(
          `[backup] Auto backup OK ${result.stamp} → ${result.locations.length} location(s)`,
        );
      }
    })()
      .catch((error) => {
        console.error("[backup] AUTO BACKUP FAILED unexpectedly", error);
      })
      .finally(() => {
        inFlight = null;
      });
  }, 2500);
}

export async function flushAutoBackup() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inFlight) {
    await inFlight;
  }
}
