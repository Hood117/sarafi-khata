/**
 * Public API for backup & restore.
 */

export {
  createBackupAction,
  listBackupsAction,
  restoreBackupAction,
  type BackupActionResult,
} from "@/features/backup/actions/backup-actions";

export { BackupRestoreView } from "@/features/backup/components/backup-restore-view";
export { queueAutoBackup } from "@/features/backup/services/auto-backup";
export {
  MAX_BACKUP_COPIES,
  createVerifiedBackup,
  listPrimaryBackups,
  restoreVerifiedBackup,
  type BackupListItem,
} from "@/features/backup/services/backup-engine";
