import "server-only";

import type {
  HawalaTransferRecord,
  ReceiveHawalaInput,
} from "@/features/hawala/domain/types";
import { createAndPostHawala } from "@/features/hawala/services/create-hawala";

/**
 * Receive hawala workflow: record business details, post clearing / cash-out
 * via the shared posting service, mark COMPLETED.
 */
export async function receiveHawala(
  input: ReceiveHawalaInput,
): Promise<HawalaTransferRecord> {
  const { createdById, ...party } = input;
  return createAndPostHawala({
    direction: "RECEIVE",
    input: party,
    createdById,
  });
}
