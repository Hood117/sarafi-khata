//! Offline SQLite backup / restore (ADR-042 Phase 5).

mod auto;

pub use auto::queue_auto_backup;

use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::AppError;

pub const BACKUP_FOLDER_NAME: &str = "SarafBackups";
pub const PENDING_RESTORE_FILE: &str = "saraf.db.pending-restore";
pub const PENDING_RESTORE_META: &str = "saraf.db.pending-restore.meta.json";
pub const MAX_BACKUP_COPIES: usize = 30;

const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";
const REQUIRED_BACKUP_TABLES: &[&str] = &["User", "Transaction", "LedgerEntry"];

pub const ERR_BACKUP_FILE_INVALID: &str = "BACKUP_FILE_INVALID";
pub const ERR_BACKUP_FILE_INCOMPATIBLE: &str = "BACKUP_FILE_INCOMPATIBLE";
pub const ERR_BACKUP_FILE_DAMAGED: &str = "BACKUP_FILE_DAMAGED";
pub const ERR_BACKUP_FILE_SAFETY_FAILED: &str = "BACKUP_FILE_SAFETY_FAILED";
pub const ERR_BACKUP_FILE_RESTORE_FAILED: &str = "BACKUP_FILE_RESTORE_FAILED";
pub const ERR_BACKUP_FILE_VERIFY_FAILED: &str = "BACKUP_FILE_VERIFY_FAILED";
pub const ERR_BACKUP_FILE_LIVE_DB: &str = "BACKUP_FILE_LIVE_DB";

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
    for letter in b'A'..=b'Z' {
      let root = PathBuf::from(format!("{}:\\", letter as char));
      if !root.exists() {
        continue;
      }
      // Skip non-writable / media-only volumes (probe by creating the folder).
      let probe = root.join(BACKUP_FOLDER_NAME);
      match fs::create_dir_all(&probe) {
        Ok(()) => roots.push(root),
        Err(_) => continue,
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
    if dests.iter().any(|d| {
      // Compare after canonicalize when possible so E:\data\SarafBackups == primary.
      d == &candidate
        || d.canonicalize().ok().zip(candidate.canonicalize().ok()).is_some_and(|(a, b)| a == b)
    }) {
      continue;
    }
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

pub(crate) fn find_backup_dir(db_path: &Path, stamp: &str) -> Result<PathBuf, AppError> {
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

/// Fast safety snapshot before restore (file copy after WAL checkpoint).
/// Prefer this over full `VACUUM INTO` so restore does not freeze the UI for long.
fn create_pre_restore_snapshot(conn: &Connection, db_path: &Path) -> Result<(), AppError> {
  let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
  let stamp = format!("{}-pre-restore", stamp_now());
  let created_at = chrono::Utc::now().to_rfc3339();
  let primary_root = primary_backup_root(db_path);
  let dest_dir = primary_root.join(&stamp);
  fs::create_dir_all(&dest_dir).map_err(|e| AppError::Io(format!("create pre-restore dir: {e}")))?;
  let dest_db = dest_dir.join("saraf.db");
  fs::copy(db_path, &dest_db).map_err(|e| AppError::Io(format!("copy live db for pre-restore: {e}")))?;
  let checksum = sha256_file(&dest_db)?;
  fs::write(dest_dir.join("saraf.db.sha256"), format!("{checksum}\n"))
    .map_err(|e| AppError::Io(format!("write pre-restore sha256: {e}")))?;
  write_meta(
    &dest_dir,
    &BackupMeta {
      stamp: stamp.clone(),
      reason: "pre-restore".into(),
      checksum,
      created_at,
      source_db: db_path.display().to_string(),
    },
  )?;
  let _ = prune_old_backups(&primary_root);
  Ok(())
}

/// Restore a backup into the live DB. Stages a pending restore; caller should restart the app.
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
    .unwrap_or_default();
  if !expected.is_empty() {
    let actual = sha256_file(&backup_db)?;
    if actual != expected {
      return Err(AppError::Validation(
        "Backup checksum does not match saraf.db.sha256.".into(),
      ));
    }
  }

  // Quick safety snapshot (not a full VACUUM) so the UI does not hang.
  if let Err(e) = create_pre_restore_snapshot(conn, db_path) {
    log::warn!("pre-restore snapshot failed (continuing restore): {e}");
  }

  let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

  stage_pending_restore(db_path, &backup_db, stamp, &expected)?;

  Ok(RestoreOutcome {
    stamp: stamp.to_string(),
    pending: true,
    message: "Backup staged. Applying restore…".into(),
  })
}

fn stage_pending_restore(
  db_path: &Path,
  backup_db: &Path,
  stamp: &str,
  checksum: &str,
) -> Result<(), AppError> {
  let data_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
  let pending = data_dir.join(PENDING_RESTORE_FILE);
  fs::copy(backup_db, &pending).map_err(|e| AppError::Io(format!("stage pending restore: {e}")))?;
  let meta = PendingRestoreMeta {
    stamp: stamp.to_string(),
    checksum: checksum.to_string(),
    created_at: chrono::Utc::now().to_rfc3339(),
  };
  let meta_json = serde_json::to_string_pretty(&meta)
    .map_err(|e| AppError::Internal(format!("pending meta: {e}")))?;
  fs::write(data_dir.join(PENDING_RESTORE_META), meta_json)
    .map_err(|e| AppError::Io(format!("write pending meta: {e}")))?;
  Ok(())
}

/// Stage an existing Backup History stamp as a pending restore (used to roll back a failed file restore).
pub fn stage_pending_from_stamp(db_path: &Path, stamp: &str) -> Result<(), AppError> {
  let backup_dir = find_backup_dir(db_path, stamp)?;
  let backup_db = backup_dir.join("saraf.db");
  let checksum = fs::read_to_string(backup_dir.join("saraf.db.sha256"))
    .ok()
    .map(|s| s.trim().to_string())
    .unwrap_or_default();
  stage_pending_restore(db_path, &backup_db, stamp, &checksum)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedBackupFile {
  pub path: String,
  pub stamp: String,
  pub size_bytes: u64,
  pub checksum: Option<String>,
}

fn coded_validation(code: &str) -> AppError {
  AppError::Validation(code.to_string())
}

fn paths_point_to_same_file(a: &Path, b: &Path) -> bool {
  match (fs::canonicalize(a), fs::canonicalize(b)) {
    (Ok(left), Ok(right)) => left == right,
    _ => a == b,
  }
}

/// Resolve a user-picked path (saraf.db, backup.json, sidecar, or copied .db) to the SQLite file.
pub fn resolve_backup_db_path(picked: &Path) -> Result<PathBuf, AppError> {
  if !picked.exists() {
    log::warn!("backup file not found: {}", picked.display());
    return Err(coded_validation(ERR_BACKUP_FILE_INVALID));
  }
  if picked.is_dir() {
    let db = picked.join("saraf.db");
    if db.is_file() {
      return Ok(db);
    }
    log::warn!("picked folder has no saraf.db: {}", picked.display());
    return Err(coded_validation(ERR_BACKUP_FILE_INVALID));
  }
  if !picked.is_file() {
    return Err(coded_validation(ERR_BACKUP_FILE_INVALID));
  }

  let name = picked
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("")
    .to_lowercase();

  if name == "backup.json" || name == "saraf.db.sha256" {
    if let Some(parent) = picked.parent() {
      let db = parent.join("saraf.db");
      if db.is_file() {
        return Ok(db);
      }
    }
    log::warn!("sidecar without saraf.db: {}", picked.display());
    return Err(coded_validation(ERR_BACKUP_FILE_INVALID));
  }

  if name == "saraf.db" {
    return Ok(picked.to_path_buf());
  }

  if name.ends_with(".db") || name.ends_with(".sqlite") || name.ends_with(".sqlite3") {
    return Ok(picked.to_path_buf());
  }

  if let Some(parent) = picked.parent() {
    let db = parent.join("saraf.db");
    if db.is_file() {
      return Ok(db);
    }
  }

  log::warn!("picked file is not a Saraf backup: {}", picked.display());
  Err(coded_validation(ERR_BACKUP_FILE_INVALID))
}

fn ensure_required_saraf_tables(conn: &Connection, err_code: &str) -> Result<(), AppError> {
  for table in REQUIRED_BACKUP_TABLES {
    let exists: i64 = conn
      .query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [*table],
        |row| row.get(0),
      )
      .map_err(|e| {
        log::error!("backup schema check failed for {table}: {e}");
        coded_validation(err_code)
      })?;
    if exists == 0 {
      log::warn!("backup missing required table {table}");
      return Err(coded_validation(err_code));
    }
  }
  Ok(())
}

fn integrity_ok(conn: &Connection, err_code: &str) -> Result<(), AppError> {
  let integrity: String = conn
    .query_row("PRAGMA integrity_check", [], |row| row.get(0))
    .map_err(|e| {
      log::error!("backup integrity_check query failed: {e}");
      coded_validation(err_code)
    })?;
  if integrity != "ok" {
    log::error!("backup integrity_check: {integrity}");
    return Err(coded_validation(err_code));
  }
  Ok(())
}

/// Validate a manually selected backup without touching the live database.
pub fn validate_backup_file(
  picked: &Path,
  live_db_path: Option<&Path>,
) -> Result<ValidatedBackupFile, AppError> {
  let db_file = resolve_backup_db_path(picked)?;
  if let Some(live) = live_db_path {
    if paths_point_to_same_file(&db_file, live) {
      return Err(coded_validation(ERR_BACKUP_FILE_LIVE_DB));
    }
  }

  let mut header = [0u8; 16];
  {
    let mut file = File::open(&db_file).map_err(|e| {
      log::error!("open backup for header: {e}");
      coded_validation(ERR_BACKUP_FILE_INVALID)
    })?;
    if file.read_exact(&mut header).is_err() || header.as_slice() != SQLITE_HEADER {
      log::warn!("backup file is not SQLite: {}", db_file.display());
      return Err(coded_validation(ERR_BACKUP_FILE_INVALID));
    }
  }

  let checksum_sidecar = db_file
    .parent()
    .map(|p| p.join("saraf.db.sha256"))
    .filter(|p| p.is_file());
  let expected = checksum_sidecar
    .as_ref()
    .and_then(|p| fs::read_to_string(p).ok())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let actual = sha256_file(&db_file).map_err(|e| {
    log::error!("hash backup file: {e}");
    coded_validation(ERR_BACKUP_FILE_DAMAGED)
  })?;
  if let Some(ref expected_hash) = expected {
    if actual != *expected_hash {
      log::warn!("backup checksum mismatch for {}", db_file.display());
      return Err(coded_validation(ERR_BACKUP_FILE_DAMAGED));
    }
  }

  let conn = Connection::open_with_flags(
    &db_file,
    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
  )
  .map_err(|e| {
    log::error!("open backup read-only failed: {e}");
    coded_validation(ERR_BACKUP_FILE_INVALID)
  })?;
  integrity_ok(&conn, ERR_BACKUP_FILE_DAMAGED)?;
  ensure_required_saraf_tables(&conn, ERR_BACKUP_FILE_INCOMPATIBLE)?;

  let size_bytes = fs::metadata(&db_file).map(|m| m.len()).unwrap_or(0);
  let stamp = db_file
    .parent()
    .and_then(|p| {
      fs::read_to_string(p.join("backup.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<BackupMeta>(&s).ok())
        .map(|m| m.stamp)
        .or_else(|| {
          p.file_name()
            .and_then(|n| n.to_str())
            .filter(|s| !s.is_empty() && *s != "." && *s != "..")
            .map(|s| s.to_string())
        })
    })
    .unwrap_or_else(|| "file".into());

  Ok(ValidatedBackupFile {
    path: db_file.display().to_string(),
    stamp,
    size_bytes,
    checksum: expected.or(Some(actual)),
  })
}

/// After the user confirms: safety-backup the live DB (must succeed), then stage the selected file.
pub fn stage_backup_file_restore(
  conn: &Connection,
  live_db_path: &Path,
  backup_db: &Path,
  stamp: &str,
  checksum: &str,
) -> Result<RestoreOutcome, AppError> {
  let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
  stage_pending_restore(live_db_path, backup_db, stamp, checksum)?;
  Ok(RestoreOutcome {
    stamp: stamp.to_string(),
    pending: true,
    message: "Backup staged. Applying restore…".into(),
  })
}

/// Confirm the live connection is a usable Saraf database after restore.
pub fn verify_saraf_database(conn: &Connection) -> Result<(), AppError> {
  integrity_ok(conn, ERR_BACKUP_FILE_VERIFY_FAILED)?;
  ensure_required_saraf_tables(conn, ERR_BACKUP_FILE_VERIFY_FAILED)?;
  conn
    .query_row(r#"SELECT COUNT(*) FROM "User""#, [], |row| row.get::<_, i64>(0))
    .map_err(|e| {
      log::error!("restored database is not queryable: {e}");
      coded_validation(ERR_BACKUP_FILE_VERIFY_FAILED)
    })?;
  Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
  pub stamp: String,
  pub pending: bool,
  pub message: String,
}

/// Remove staged restore / leftover journal files so they cannot resurrect wiped data.
/// Does not delete `license.json` or the live `saraf.db`.
/// Call only after WAL checkpoint (or with no live writers) before deleting `-wal`/`-shm`.
pub fn clear_stale_restore_sidecars(db_path: &Path) -> Result<(), AppError> {
  let data_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
  for name in [
    PENDING_RESTORE_FILE,
    PENDING_RESTORE_META,
    "saraf.db.restoring",
    "saraf.restore-session.json",
  ] {
    let path = data_dir.join(name);
    if path.is_file() {
      fs::remove_file(&path)
        .map_err(|e| AppError::Io(format!("remove {}: {e}", path.display())))?;
    }
  }
  Ok(())
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

#[cfg(test)]
mod tests {
  use super::*;
  use rusqlite::Connection;
  use std::fs;

  fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("saraf-backup-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn write_saraf_schema(path: &Path) {
    let conn = Connection::open(path).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (id TEXT PRIMARY KEY);
        CREATE TABLE "Transaction" (id TEXT PRIMARY KEY);
        CREATE TABLE "LedgerEntry" (id TEXT PRIMARY KEY);
        INSERT INTO "User" (id) VALUES ('u1');
        "#,
      )
      .unwrap();
  }

  #[test]
  fn resolve_backup_json_to_sibling_db() {
    let dir = temp_dir();
    let db = dir.join("saraf.db");
    fs::write(&db, b"SQLite format 3\0placeholder").unwrap();
    fs::write(dir.join("backup.json"), "{}").unwrap();
    let resolved = resolve_backup_db_path(&dir.join("backup.json")).unwrap();
    assert_eq!(resolved, db);
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn resolve_rejects_unrelated_file() {
    let dir = temp_dir();
    let file = dir.join("notes.txt");
    fs::write(&file, b"hello").unwrap();
    assert!(resolve_backup_db_path(&file).is_err());
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn validate_rejects_non_sqlite() {
    let dir = temp_dir();
    let file = dir.join("saraf.db");
    fs::write(&file, b"not a database").unwrap();
    let err = validate_backup_file(&file, None).unwrap_err().to_string();
    assert!(err.contains(ERR_BACKUP_FILE_INVALID), "{err}");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn validate_rejects_incompatible_schema() {
    let dir = temp_dir();
    let file = dir.join("saraf.db");
    let conn = Connection::open(&file).unwrap();
    conn.execute_batch(r#"CREATE TABLE "User" (id TEXT);"#).unwrap();
    drop(conn);
    let err = validate_backup_file(&file, None).unwrap_err().to_string();
    assert!(err.contains(ERR_BACKUP_FILE_INCOMPATIBLE), "{err}");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn validate_accepts_compatible_saraf_db() {
    let dir = temp_dir();
    let file = dir.join("saraf.db");
    write_saraf_schema(&file);
    let info = validate_backup_file(&file, None).unwrap();
    assert_eq!(PathBuf::from(&info.path), file);
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn validate_rejects_checksum_mismatch() {
    let dir = temp_dir();
    let file = dir.join("saraf.db");
    write_saraf_schema(&file);
    fs::write(dir.join("saraf.db.sha256"), "deadbeef\n").unwrap();
    let err = validate_backup_file(&file, None).unwrap_err().to_string();
    assert!(err.contains(ERR_BACKUP_FILE_DAMAGED), "{err}");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn validate_rejects_live_database_path() {
    let dir = temp_dir();
    let file = dir.join("saraf.db");
    write_saraf_schema(&file);
    let err = validate_backup_file(&file, Some(&file)).unwrap_err().to_string();
    assert!(err.contains(ERR_BACKUP_FILE_LIVE_DB), "{err}");
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn clear_stale_restore_sidecars_keeps_license_and_db() {
    let dir = temp_dir();
    let db = dir.join("saraf.db");
    fs::write(&db, b"sqlite").unwrap();
    fs::write(dir.join("license.json"), b"{\"ok\":true}").unwrap();
    fs::write(dir.join(PENDING_RESTORE_FILE), b"old").unwrap();
    fs::write(dir.join(PENDING_RESTORE_META), b"{}").unwrap();
    fs::write(dir.join("saraf.restore-session.json"), b"{}").unwrap();
    clear_stale_restore_sidecars(&db).unwrap();
    assert!(db.is_file());
    assert!(dir.join("license.json").is_file());
    assert!(!dir.join(PENDING_RESTORE_FILE).is_file());
    assert!(!dir.join(PENDING_RESTORE_META).is_file());
    assert!(!dir.join("saraf.restore-session.json").is_file());
    let _ = fs::remove_dir_all(&dir);
  }
}
