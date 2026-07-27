import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requirePermission } from "@/features/auth/permissions/authorize";

export default async function BackupRestorePage() {
  await requirePermission("backup.manage");

  return (
    <PagePlaceholder
      title="Backup & Restore"
      description="Database backup and restore tools will appear here."
    />
  );
}
