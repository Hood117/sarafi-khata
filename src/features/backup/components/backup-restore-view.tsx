"use client";

import { HardDrive, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import {
  createBackupAction,
  listBackupsAction,
  restoreBackupAction,
} from "@/features/backup/actions/backup-actions";
import type { BackupListItem } from "@/features/backup/services/backup-engine";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupRestoreView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [busyStamp, setBusyStamp] = useState<string | null>(null);

  async function refreshList() {
    const result = await listBackupsAction();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBackups(result.backups);
  }

  useEffect(() => {
    void refreshList();
  }, []);

  function handleBackupNow() {
    setMessage(null);
    setError(null);
    setDetails([]);
    startTransition(async () => {
      const result = await createBackupAction();
      if (!result.ok) {
        setError(result.message);
        setDetails(result.details ?? []);
        return;
      }
      setMessage(result.message);
      setDetails(result.warnings ?? []);
      await refreshList();
      router.refresh();
    });
  }

  function handleRestore(backup: BackupListItem) {
    const confirmed = window.confirm(
      [
        `Restore backup ${backup.stamp}?`,
        "",
        "1. A safety backup of the current database is created first.",
        "2. The selected backup is staged for restore.",
        "3. Close Saraf completely, then open it again to finish restore.",
        "",
        "Do not use the app until after a full restart.",
      ].join("\n"),
    );
    if (!confirmed) return;

    setMessage(null);
    setError(null);
    setDetails([]);
    setBusyStamp(backup.stamp);
    startTransition(async () => {
      const result = await restoreBackupAction(backup.path);
      setBusyStamp(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      await refreshList();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {embedded ? null : (
          <Typography variant="h3" as="h2">
            Backup &amp; Restore
          </Typography>
        )}
        <Typography variant="muted">
          Automatic backups run after data changes. Each backup is checksum
          verified and copied to every available drive under{" "}
          <span className="font-medium">SarafBackups</span>. Up to 50 copies are
          kept; the oldest are deleted automatically.
          {backups[0] ? (
            <>
              {" "}
              Latest backup:{" "}
              <span className="text-foreground font-medium">
                {backups[0].stamp}
              </span>{" "}
              ({formatBytes(backups[0].sizeBytes)}).
            </>
          ) : null}
        </Typography>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleBackupNow} disabled={isPending}>
          {isPending && !busyStamp ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <HardDrive data-icon="inline-start" />
          )}
          Backup now
        </Button>
      </div>

      {message ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="text-destructive text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {details.length > 0 ? (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
          {details.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Backup</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="text-muted-foreground px-3 py-6 text-center"
                >
                  No backups yet. Create one or wait for an automatic backup.
                </td>
              </tr>
            ) : (
              backups.map((backup) => (
                <tr key={backup.stamp} className="border-t border-foreground/10">
                  <td className="px-3 py-2 font-mono text-xs">{backup.stamp}</td>
                  <td className="px-3 py-2">
                    {new Date(backup.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{formatBytes(backup.sizeBytes)}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRestore(backup)}
                    >
                      {busyStamp === backup.stamp ? (
                        <Loader2 className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <RotateCcw data-icon="inline-start" />
                      )}
                      Restore
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
