//! Offline SQLite backup / restore (ADR-042 Phase 5).

mod auto;

pub use auto::queue_auto_backup;

use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::AppError;

pub const BACKUP_FOLDER_NAME: &str = "SarafBackups";
pub const PENDING_RESTORE_FILE: &str = "saraf.db.pending-restore";
pub const PENDING_RESTORE_META: &str = "saraf.db.pending-restore.meta.json";
pub const MAX_BACKUP_COPIES: usize = 50;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
  pub stamp: String,
  pub checksum: String,
  pub locations: Vec<String>,
  pub pruned: usize,
  pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListItem {
  pub stamp: String,
  pub path: String,
  pub size_bytes: u64,
  pub checksum: Option<String>,
  pub created_at: String,
  pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupMeta {
  stamp: String,
  reason: String,
  checksum: String,
  created_at: String,
  source_db: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestoreMeta {
  stamp: String,
  checksum: String,
  created_at: String,
}

fn stamp_now() -> String {
  Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn sanitize_reason(reason: &str) -> String {
  let trimmed = reason.trim();
  if trimmed.is_empty() {
    return "manual".into();
  }
  trimmed
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '-'
      }
    })
    .collect::<String>()
    .chars()
    .take(48)
    .collect()
}

pub fn primary_backup_root(db_path: &Path) -> PathBuf {
  db_path
    .parent()
    .unwrap_or_else(|| Path::new("."))
    .join(BACKUP_FOLDER_NAME)
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
  let mut file = File::open(path).map_err(|e| AppError::Io(format!("open for hash: {e}")))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 1024 * 64];
  loop {
    let n = file
      .read(&mut buf)
      .map_err(|e| AppError::Io(format!("read for hash: {e}")))?;
    if n == 0 {
      break;
    }
    hasher.update(&buf[..n]);
  }
  Ok(hex::encode(hasher.finalize()))
}

fn list_windows_drive_roots() -> Vec<PathBuf> {
  #[cfg(windows)]
  {
    let mut roots = Vec::new();
    for letter in b'C'..=b'Z' {
      let root = PathBuf::from(format!("{}:\\", letter as char));
      if root.exists() {
        roots.push(root);
      }
    }
    roots
  }
  #[cfg(not(windows))]
  {
    Vec::new()
  }
}

fn backup_destinations(db_path: &Path) -> Vec<PathBuf> {
  let mut dests = vec![primary_backup_root(db_path)];
  for root in list_windows_drive_roots() {
    let candidate = root.join(BACKUP_FOLDER_NAME);
    if dests.iter().any(|d| d == &candidate) {
      continue;
    }
    // Skip the drive that already holds the primary root when it's the same path.
    dests.push(candidate);
  }
  dests
}

fn prune_old_backups(root: &Path) -> Result<usize, AppError> {
  if !root.is_dir() {
    return Ok(0);
  }
  let mut dirs: Vec<_> = fs::read_dir(root)
    .map_err(|e| AppError::Io(format!("read backups: {e}")))?
    .filter_map(|e| e.ok())
    .filter(|e| e.path().is_dir())
    .filter(|e| e.path().join("saraf.db").is_file())
    .collect();
  dirs.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
  let mut pruned = 0usize;
  for entry in dirs.into_iter().skip(MAX_BACKUP_COPIES) {
    let path = entry.path();
    if fs::remove_dir_all(&path).is_ok() {
      pruned += 1;
    }
  }
  Ok(pruned)
}

fn write_meta(dir: &Path, meta: &BackupMeta) -> Result<(), AppError> {
  let json = serde_json::to_string_pretty(meta)
    .map_err(|e| AppError::Internal(format!("backup.json: {e}")))?;
  fs::write(dir.join("backup.json"), json)
    .map_err(|e| AppError::Io(format!("write backup.json: {e}")))?;
  Ok(())
}

/// Create a verified backup of the live database.
pub fn create_backup(conn: &Connection, db_path: &Path, reason: &str) -> Result<BackupResult, AppError> {
  let reason = sanitize_reason(reason);
  let stamp = format!("{}-{}", stamp_now(), reason);
  let created_at = chrono::Utc::now().to_rfc3339();

  // Flush WAL into the main DB file before copying.
  let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

  let primary_root = primary_backup_root(db_path);
  let tmp_dir = primary_root.join(".tmp").join(&stamp);
  fs::create_dir_all(&tmp_dir).map_err(|e| AppError::Io(format!("create tmp backup dir: {e}")))?;
  let tmp_db = tmp_dir.join("saraf.db");

  // Consistent snapshot into a new file (SQLite 3.27+).
  // Escape single quotes for SQL string literal.
  let vacuum_path = tmp_db
    .to_string_lossy()
    .replace('\\', "/")
    .replace('\'', "''");
  conn
    .execute(&format!("VACUUM INTO '{vacuum_path}'"), [])
    .map_err(|e| AppError::Db(format!("VACUUM INTO backup failed: {e}")))?;

  let checksum = sha256_file(&tmp_db)?;
  fs::write(tmp_dir.join("saraf.db.sha256"), format!("{checksum}\n"))
    .map_err(|e| AppError::Io(format!("write sha256: {e}")))?;

  let meta = BackupMeta {
    stamp: stamp.clone(),
    reason: reason.clone(),
    checksum: checksum.clone(),
    created_at: created_at.clone(),
    source_db: db_path.display().to_string(),
  };
  write_meta(&tmp_dir, &meta)?;

  let mut locations = Vec::new();
  let mut warnings = Vec::new();
  let mut pruned_total = 0usize;

  for root in backup_destinations(db_path) {
    let dest_dir = root.join(&stamp);
    match copy_backup_dir(&tmp_dir, &dest_dir, &checksum) {
      Ok(()) => {
        locations.push(dest_dir.display().to_string());
        match prune_old_backups(&root) {
          Ok(n) => pruned_total += n,
          Err(e) => warnings.push(format!("prune {}: {e}", root.display())),
        }
      }
      Err(e) => {
        // Primary must succeed; mirrors are best-effort.
        if root == primary_root {
          let _ = fs::remove_dir_all(&tmp_dir);
          return Err(e);
        }
        warnings.push(format!("mirror {}: {e}", root.display()));
      }
    }
  }

  let _ = fs::remove_dir_all(&tmp_dir);
  if locations.is_empty() {
    return Err(AppError::Io("Backup failed: no locations written.".into()));
  }

  Ok(BackupResult {
    stamp,
    checksum,
    locations,
    pruned: pruned_total,
    warnings,
  })
}

fn copy_backup_dir(src_dir: &Path, dest_dir: &Path, expected_hash: &str) -> Result<(), AppError> {
  fs::create_dir_all(dest_dir).map_err(|e| AppError::Io(format!("create backup dir: {e}")))?;
  let src_db = src_dir.join("saraf.db");
  let dest_db = dest_dir.join("saraf.db");
  fs::copy(&src_db, &dest_db).map_err(|e| AppError::Io(format!("copy backup db: {e}")))?;
  let actual = sha256_file(&dest_db)?;
  if actual != expected_hash {
    let _ = fs::remove_dir_all(dest_dir);
    return Err(AppError::Io(format!(
      "Checksum mismatch after copy to {}",
      dest_dir.display()
    )));
  }
  for name in ["saraf.db.sha256", "backup.json"] {
    let _ = fs::copy(src_dir.join(name), dest_dir.join(name));
  }
  Ok(())
}

pub fn list_backups(db_path: &Path) -> Result<Vec<BackupListItem>, AppError> {
  let root = primary_backup_root(db_path);
  if !root.is_dir() {
    return Ok(vec![]);
  }
  let mut items = Vec::new();
  let mut entries: Vec<_> = fs::read_dir(&root)
    .map_err(|e| AppError::Io(format!("list backups: {e}")))?
    .filter_map(|e| e.ok())
    .filter(|e| e.path().is_dir())
    .collect();
  entries.sort_by_key(|e| std::cmp::Reverse(e.file_name()));

  for entry in entries {
    let path = entry.path();
    let db_file = path.join("saraf.db");
    if !db_file.is_file() {
      continue;
    }
    let stamp = entry.file_name().to_string_lossy().to_string();
    let size_bytes = fs::metadata(&db_file).map(|m| m.len()).unwrap_or(0);
    let checksum = fs::read_to_string(path.join("saraf.db.sha256"))
      .ok()
      .map(|s| s.trim().to_string());
    let (created_at, reason) = fs::read_to_string(path.join("backup.json"))
      .ok()
      .and_then(|s| serde_json::from_str::<BackupMeta>(&s).ok())
      .map(|m| (m.created_at, Some(m.reason)))
      .unwrap_or_else(|| (String::new(), None));
    items.push(BackupListItem {
      stamp,
      path: path.display().to_string(),
      size_bytes,
      checksum,
      created_at,
      reason,
    });
  }
  Ok(items)
}

fn find_backup_dir(db_path: &Path, stamp: &str) -> Result<PathBuf, AppError> {
  let stamp = stamp.trim();
  if stamp.is_empty() || stamp.contains("..") || stamp.contains('/') || stamp.contains('\\') {
    return Err(AppError::Validation("Invalid backup stamp.".into()));
  }
  let primary = primary_backup_root(db_path).join(stamp);
  if primary.join("saraf.db").is_file() {
    return Ok(primary);
  }
  for root in backup_destinations(db_path) {
    let candidate = root.join(stamp);
    if candidate.join("saraf.db").is_file() {
      return Ok(candidate);
    }
  }
  Err(AppError::NotFound(format!("Backup \"{stamp}\" was not found.")))
}

/// Restore a backup into the live DB. If the live file is locked, stage a pending restore.
pub fn restore_backup(
  conn: &Connection,
  db_path: &Path,
  stamp: &str,
) -> Result<RestoreOutcome, AppError> {
  let backup_dir = find_backup_dir(db_path, stamp)?;
  let backup_db = backup_dir.join("saraf.db");
  let expected = fs::read_to_string(backup_dir.join("saraf.db.sha256"))
    .ok()
    .map(|s| s.trim().to_string())
    .unwrap_or_else(|| sha256_file(&backup_db).unwrap_or_default());
  if !expected.is_empty() {
    let actual = sha256_file(&backup_db)?;
    if actual != expected {
      return Err(AppError::Validation(
        "Backup checksum does not match saraf.db.sha256.".into(),
      ));
    }
  }

  // Safety snapshot before restore.
  let _ = create_backup(conn, db_path, "pre-restore");

  let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

  // Try direct replace via VACUUM INTO live path is unsafe while open.
  // Stage pending restore and instruct restart — safest with an open connection.
  let data_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
  let pending = data_dir.join(PENDING_RESTORE_FILE);
  fs::copy(&backup_db, &pending).map_err(|e| AppError::Io(format!("stage pending restore: {e}")))?;
  let meta = PendingRestoreMeta {
    stamp: stamp.to_string(),
    checksum: expected,
    created_at: chrono::Utc::now().to_rfc3339(),
  };
  let meta_json = serde_json::to_string_pretty(&meta)
    .map_err(|e| AppError::Internal(format!("pending meta: {e}")))?;
  fs::write(data_dir.join(PENDING_RESTORE_META), meta_json)
    .map_err(|e| AppError::Io(format!("write pending meta: {e}")))?;

  Ok(RestoreOutcome {
    stamp: stamp.to_string(),
    pending: true,
    message: "Backup staged. Restart the app to finish restore.".into(),
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
  pub stamp: String,
  pub pending: bool,
  pub message: String,
}

/// Apply staged pending restore before opening the live connection.
pub fn apply_pending_restore_if_any(db_path: &Path) -> Result<Option<String>, AppError> {
  let data_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
  let pending = data_dir.join(PENDING_RESTORE_FILE);
  if !pending.is_file() {
    return Ok(None);
  }

  for suffix in ["-wal", "-shm", "-journal"] {
    let extra = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
    let _ = fs::remove_file(extra);
  }

  let meta_path = data_dir.join(PENDING_RESTORE_META);
  let stamp = fs::read_to_string(&meta_path)
    .ok()
    .and_then(|s| serde_json::from_str::<PendingRestoreMeta>(&s).ok())
    .map(|m| m.stamp)
    .unwrap_or_else(|| "pending".into());

  let tmp = data_dir.join("saraf.db.restoring");
  fs::copy(&pending, &tmp).map_err(|e| AppError::Io(format!("copy pending restore: {e}")))?;
  if let Err(e) = fs::rename(&tmp, db_path) {
    fs::copy(&tmp, db_path).map_err(|e2| {
      AppError::Io(format!("apply pending restore failed (rename {e}; copy {e2})"))
    })?;
    let _ = fs::remove_file(&tmp);
  }
  let _ = fs::remove_file(&pending);
  let _ = fs::remove_file(&meta_path);
  Ok(Some(stamp))
}
