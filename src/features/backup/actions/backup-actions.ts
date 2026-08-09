"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  createVerifiedBackup,
  listPrimaryBackups,
  restoreVerifiedBackup,
  type BackupListItem,
} from "@/features/backup/services/backup-engine";

export type BackupActionResult =
  | {
      ok: true;
      message: string;
      stamp?: string;
      locations?: string[];
      warnings?: string[];
      requiresRestart?: boolean;
    }
  | { ok: false; message: string; details?: string[] };

export async function createBackupAction(): Promise<BackupActionResult> {
  await requirePermission("backup.manage");
  const result = await createVerifiedBackup("manual");
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      details: result.details,
    };
  }

  return {
    ok: true,
    message: `Backup saved to ${result.locations.length} location(s).`,
    stamp: result.stamp,
    locations: result.locations,
    warnings: result.warnings,
  };
}

export async function listBackupsAction(): Promise<
  | { ok: true; backups: BackupListItem[] }
  | { ok: false; message: string }
> {
  await requirePermission("backup.manage");
  try {
    return { ok: true, backups: listPrimaryBackups() };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to list backups.",
    };
  }
}

export async function restoreBackupAction(
  backupPath: string,
): Promise<BackupActionResult> {
  await requirePermission("backup.manage");
  if (!backupPath || typeof backupPath !== "string") {
    return { ok: false, message: "Backup path is required." };
  }

  const result = await restoreVerifiedBackup(backupPath);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    message: result.message,
    requiresRestart: result.requiresRestart,
  };
}
