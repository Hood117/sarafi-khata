import "server-only";

import { HawalaError } from "@/features/hawala/domain/errors";
import type { HawalaTransferRecord } from "@/features/hawala/domain/types";
import {
  findHawalaTransferById,
  markHawalaCancelled,
} from "@/features/hawala/repositories/hawala-repository";
import { findTransactionByReference } from "@/features/transactions/repositories/transaction-repository";

/**
 * Cancels a PENDING hawala transfer. Completed transfers are not reversed here
 * (void/reversing entries are a separate roadmap item).
 */
export async function cancelHawala(
  hawalaId: string,
): Promise<HawalaTransferRecord> {
  const hawala = await findHawalaTransferById(hawalaId);
  if (!hawala) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  if (hawala.status === "CANCELLED") {
    throw new HawalaError(
      "INVALID_STATUS",
      "Hawala transfer is already cancelled.",
    );
  }

  if (hawala.status === "COMPLETED" || hawala.transactionId) {
    throw new HawalaError(
      "INVALID_STATUS",
      "Completed hawala transfers cannot be cancelled without a void/reversal.",
    );
  }

  if (hawala.status !== "PENDING") {
    throw new HawalaError(
      "INVALID_STATUS",
      "Only pending hawala transfers can be cancelled.",
    );
  }

  // Guard orphaned posts: money may already be posted under this reference
  // even if transactionId was not linked yet.
  const posted = await findTransactionByReference(hawala.reference);
  if (posted) {
    throw new HawalaError(
      "INVALID_STATUS",
      "Cannot cancel: a posted transaction already exists for this reference. Complete the hawala instead.",
    );
  }

  return markHawalaCancelled(hawala.id);
}
