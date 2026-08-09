import "server-only";

import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import { HawalaError } from "@/features/hawala/domain/errors";
import {
  findHawalaTransferById,
  softDeleteHawalaTransfer,
} from "@/features/hawala/repositories/hawala-repository";

export async function archiveHawalaRecord(id: string) {
  const existing = await findHawalaTransferById(id);
  if (!existing) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  const archived = await softDeleteHawalaTransfer(id);
  queueAutoBackup("hawala-archive");
  return archived;
}
