import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export const MAX_BACKUP_COPIES = 50;
export const BACKUP_FOLDER_NAME = "SarafBackups";
export const PENDING_RESTORE_FILE = "saraf.db.pending-restore";
export const PENDING_RESTORE_META = "saraf.db.pending-restore.meta.json";

export type BackupResult = {
  ok: true;
  stamp: string;
  checksum: string;
  locations: string[];
  pruned: number;
  warnings: string[];
};

export type BackupFailure = {
  ok: false;
  message: string;
  details?: string[];
};

export type BackupListItem = {
  stamp: string;
  path: string;
  sizeBytes: number;
  checksum: string | null;
  createdAt: string;
};

function sqlitePathFromUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: SQLite URL.");
  }
  let filePath = trimmed.slice("file:".length);
  if (filePath.startsWith("///")) {
    filePath = filePath.slice(3);
  } else if (filePath.startsWith("//")) {
    filePath = filePath.slice(2);
  }
  if (process.platform === "win32" && filePath.startsWith("/")) {
    filePath = filePath.slice(1);
  }
  return path.resolve(filePath.replace(/\//g, path.sep));
}

export function getLiveDatabasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return sqlitePathFromUrl(url);
}

export function getPrimaryBackupRoot(): string {
  const dbPath = getLiveDatabasePath();
  return path.join(path.dirname(dbPath), BACKUP_FOLDER_NAME);
}

export function listAvailableDriveRoots(): string[] {
  if (process.platform !== "win32") {
    return [];
  }

  const roots: string[] = [];
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) {
        roots.push(root);
      }
    } catch {
      // Ignore inaccessible drives.
    }
  }
  return roots;
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function stampNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function copyVerified(source: string, destination: string, expectedHash: string) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  const actual = sha256File(destination);
  if (actual !== expectedHash) {
    try {
      fs.unlinkSync(destination);
    } catch {
      // ignore
    }
    throw new Error(`Checksum mismatch after copy to ${destination}`);
  }
  fs.writeFileSync(`${destination}.sha256`, `${expectedHash}\n`, "utf8");
}

function pruneOldBackups(root: string): number {
  if (!fs.existsSync(root)) {
    return 0;
  }

  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== ".tmp")
    .map((entry) => {
      const full = path.join(root, entry.name);
      const stat = fs.statSync(full);
      return { name: entry.name, full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  let pruned = 0;
  for (const entry of entries.slice(MAX_BACKUP_COPIES)) {
    fs.rmSync(entry.full, { recursive: true, force: true });
    pruned += 1;
  }
  return pruned;
}

async function sqliteBackupToFile(sourcePath: string, destinationPath: string) {
  ensureDir(path.dirname(destinationPath));
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

/**
 * Creates a verified SQLite backup and mirrors it to every available drive
 * (plus the primary AppData/db-adjacent backup folder). Keeps at most 50
 * stamped folders per location, deleting the oldest first.
 */
export async function createVerifiedBackup(
  reason = "manual",
): Promise<BackupResult | BackupFailure> {
  const details: string[] = [];

  try {
    const livePath = getLiveDatabasePath();
    if (!fs.existsSync(livePath)) {
      return { ok: false, message: "Live database file was not found." };
    }

    const liveDb = new Database(livePath);
    try {
      liveDb.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      liveDb.close();
    }

    const stamp = `${stampNow()}-${reason.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40)}`;
    const tempDir = path.join(getPrimaryBackupRoot(), ".tmp", stamp);
    ensureDir(tempDir);
    const tempDb = path.join(tempDir, "saraf.db");

    await sqliteBackupToFile(livePath, tempDb);

    const checksum = sha256File(tempDb);
    if (!checksum || fs.statSync(tempDb).size < 1024) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return {
        ok: false,
        message: "Backup failed verification (empty or invalid snapshot).",
      };
    }

    const targets = [
      getPrimaryBackupRoot(),
      ...listAvailableDriveRoots().map((root) =>
        path.join(root, BACKUP_FOLDER_NAME),
      ),
    ];

    const uniqueTargets = [...new Set(targets.map((item) => path.resolve(item)))];
    const locations: string[] = [];
    let pruned = 0;

    for (const root of uniqueTargets) {
      try {
        const destDir = path.join(root, stamp);
        const destDb = path.join(destDir, "saraf.db");
        copyVerified(tempDb, destDb, checksum);
        fs.writeFileSync(
          path.join(destDir, "backup.json"),
          JSON.stringify(
            {
              stamp,
              reason,
              checksum,
              createdAt: new Date().toISOString(),
              source: livePath,
            },
            null,
            2,
          ),
          "utf8",
        );
        locations.push(destDir);
        pruned += pruneOldBackups(root);
      } catch (error) {
        details.push(
          `${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    fs.rmSync(tempDir, { recursive: true, force: true });

    if (locations.length === 0) {
      return {
        ok: false,
        message: "Backup failed on every target location.",
        details,
      };
    }

    return {
      ok: true,
      stamp,
      checksum,
      locations,
      pruned,
      warnings: details,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Backup failed unexpectedly.",
      details,
    };
  }
}

export function listPrimaryBackups(): BackupListItem[] {
  const root = getPrimaryBackupRoot();
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== ".tmp")
    .map((entry) => {
      const dir = path.join(root, entry.name);
      const dbPath = path.join(dir, "saraf.db");
      const metaPath = path.join(dir, "backup.json");
      const shaPath = `${dbPath}.sha256`;
      if (!fs.existsSync(dbPath)) {
        return null;
      }
      const stat = fs.statSync(dbPath);
      let checksum: string | null = null;
      if (fs.existsSync(shaPath)) {
        checksum = fs.readFileSync(shaPath, "utf8").trim();
      }
      let createdAt = stat.mtime.toISOString();
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
            createdAt?: string;
            checksum?: string;
          };
          if (meta.createdAt) createdAt = meta.createdAt;
          if (meta.checksum) checksum = meta.checksum;
        } catch {
          // ignore bad meta
        }
      }
      return {
        stamp: entry.name,
        path: dbPath,
        sizeBytes: stat.size,
        checksum,
        createdAt,
      } satisfies BackupListItem;
    })
    .filter((item): item is BackupListItem => item != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type RestoreResult =
  | { ok: true; message: string; requiresRestart: boolean }
  | { ok: false; message: string };

export async function restoreVerifiedBackup(
  backupDbPath: string,
): Promise<RestoreResult> {
  try {
    if (!fs.existsSync(backupDbPath)) {
      return { ok: false, message: "Backup file was not found." };
    }

    const shaPath = `${backupDbPath}.sha256`;
    const expected = fs.existsSync(shaPath)
      ? fs.readFileSync(shaPath, "utf8").trim()
      : sha256File(backupDbPath);
    const actual = sha256File(backupDbPath);
    if (actual !== expected) {
      return {
        ok: false,
        message: "Backup failed checksum verification. Restore aborted.",
      };
    }

    if (fs.statSync(backupDbPath).size < 1024) {
      return { ok: false, message: "Backup file looks empty or corrupt." };
    }

    const livePath = getLiveDatabasePath();
    const liveDir = path.dirname(livePath);
    ensureDir(liveDir);

    const safety = await createVerifiedBackup("pre-restore");
    if (!safety.ok) {
      return {
        ok: false,
        message: `Could not safety-backup current data before restore: ${safety.message}`,
      };
    }

    try {
      const liveDb = new Database(livePath);
      try {
        liveDb.pragma("wal_checkpoint(TRUNCATE)");
      } finally {
        liveDb.close();
      }

      await sqliteBackupToFile(backupDbPath, livePath);

      const restoredHash = sha256File(livePath);
      if (restoredHash !== expected) {
        return {
          ok: false,
          message:
            "Restore completed but checksum did not match. A pre-restore safety backup was kept.",
        };
      }

      return {
        ok: true,
        message:
          "Restore completed successfully. All verified data was restored. Restart the app.",
        requiresRestart: true,
      };
    } catch {
      const pendingPath = path.join(liveDir, PENDING_RESTORE_FILE);
      const pendingMeta = path.join(liveDir, PENDING_RESTORE_META);
      fs.copyFileSync(backupDbPath, pendingPath);
      fs.writeFileSync(
        pendingMeta,
        JSON.stringify(
          {
            checksum: expected,
            source: backupDbPath,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      return {
        ok: true,
        message:
          "Database was locked. Restore was staged and will apply fully on the next app restart.",
        requiresRestart: true,
      };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Restore failed unexpectedly.",
    };
  }
}

export function applyPendingRestoreIfAny(): void {
  try {
    const livePath = getLiveDatabasePath();
    const liveDir = path.dirname(livePath);
    const pendingPath = path.join(liveDir, PENDING_RESTORE_FILE);
    const pendingMeta = path.join(liveDir, PENDING_RESTORE_META);
    if (!fs.existsSync(pendingPath)) {
      return;
    }

    let expected: string | null = null;
    if (fs.existsSync(pendingMeta)) {
      try {
        const meta = JSON.parse(fs.readFileSync(pendingMeta, "utf8")) as {
          checksum?: string;
        };
        expected = meta.checksum ?? null;
      } catch {
        expected = null;
      }
    }
    const actual = sha256File(pendingPath);
    if (expected && actual !== expected) {
      fs.rmSync(pendingPath, { force: true });
      fs.rmSync(pendingMeta, { force: true });
      throw new Error("Pending restore failed checksum verification.");
    }

    for (const extra of [`${livePath}-wal`, `${livePath}-shm`]) {
      try {
        fs.rmSync(extra, { force: true });
      } catch {
        // ignore
      }
    }
    fs.copyFileSync(pendingPath, livePath);
    fs.rmSync(pendingPath, { force: true });
    fs.rmSync(pendingMeta, { force: true });
  } catch (error) {
    console.error("Failed to apply pending database restore", error);
  }
}
