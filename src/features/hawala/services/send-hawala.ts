import "server-only";

import type { HawalaTransferRecord, SendHawalaInput } from "@/features/hawala/domain/types";
import { createAndPostHawala } from "@/features/hawala/services/create-hawala";

/**
 * Send hawala workflow: record business details, post cash-in / clearing
 * via the shared posting service, mark COMPLETED.
 */
export async function sendHawala(
  input: SendHawalaInput,
): Promise<HawalaTransferRecord> {
  const { createdById, ...party } = input;
  return createAndPostHawala({
    direction: "SEND",
    input: party,
    createdById,
  });
}
