//! Backup / restore Tauri commands.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::backup::{
  create_backup, list_backups, restore_backup, stage_backup_file_restore, stage_pending_from_stamp,
  validate_backup_file as inspect_backup_file, verify_saraf_database, BackupListItem, BackupResult,
  RestoreOutcome, ValidatedBackupFile, ERR_BACKUP_FILE_INVALID, ERR_BACKUP_FILE_RESTORE_FAILED,
  ERR_BACKUP_FILE_SAFETY_FAILED, ERR_BACKUP_FILE_VERIFY_FAILED,
};
use crate::commands::authorize::require_user_admin;
use crate::error::AppError;
use crate::reopen_native_db_after_restore;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBackupInput {
  pub reason: Option<String>,
}

#[tauri::command]
pub fn create_db_backup(
  state: State<'_, AppState>,
  input: CreateBackupInput,
) -> Result<BackupResult, AppError> {
  let reason = input.reason.unwrap_or_else(|| "manual".into());
  let conn = state.db.lock();
  let _actor = require_user_admin(&state, &conn)?;
  create_backup(&conn, &state.db_path, &reason)
}

#[tauri::command]
pub fn list_db_backups(state: State<'_, AppState>) -> Result<Vec<BackupListItem>, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
  }
  list_backups(&state.db_path)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupInput {
  pub stamp: String,
  /// Current login token — re-bound into the restored DB so restart keeps the user signed in.
  pub session_token: Option<String>,
}

/// Stage the backup, swap the live SQLite file, and reopen the connection.
/// Does not kill the window — `request_restart` exits under `tauri dev` and never comes back.
#[tauri::command]
pub async fn restore_db_backup(
  app: AppHandle,
  state: State<'_, AppState>,
  input: RestoreBackupInput,
) -> Result<RestoreOutcome, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
  }
  let stamp = input.stamp.trim().to_string();
  if stamp.is_empty() {
    return Err(AppError::Validation("Backup stamp is required.".into()));
  }
  let session_token = input
    .session_token
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let state = state.inner().clone();
  let staged = {
    let conn = state.db.lock();
    if let Some(ref token) = session_token {
      if let Err(e) =
        crate::commands::auth::write_restore_session_bridge(&conn, &state.db_path, token)
      {
        log::warn!("could not save restore session bridge: {e}");
      }
    }
    restore_backup(&conn, &state.db_path, &stamp)?
  };

  let applied = reopen_native_db_after_restore(&app, &state)?;
  Ok(RestoreOutcome {
    stamp: applied.unwrap_or(staged.stamp),
    pending: false,
    message: "Backup restored. Reloading the desk…".into(),
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFilePathInput {
  pub path: String,
}

/// Native Windows/Tauri file picker. Cancel returns `null` (no error).
#[tauri::command]
pub async fn pick_backup_file(state: State<'_, AppState>) -> Result<Option<String>, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
  }
  let picked = tauri::async_runtime::spawn_blocking(|| {
    let mut dialog = rfd::FileDialog::new()
      .set_title("Select Saraf backup")
      .add_filter("Saraf backup", &["db", "sqlite", "sqlite3", "json"])
      .add_filter("All files", &["*"]);
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
      dialog = dialog.set_directory(PathBuf::from(home));
    }
    dialog.pick_file()
  })
  .await
  .map_err(|e| {
    log::error!("backup file picker task failed: {e}");
    AppError::Internal("Could not open the file picker.".into())
  })?;
  Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

/// Validate a selected backup file. Does not change the live database.
#[tauri::command]
pub fn validate_backup_file(
  state: State<'_, AppState>,
  input: BackupFilePathInput,
) -> Result<ValidatedBackupFile, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
  }
  let path = input.path.trim();
  if path.is_empty() {
    return Err(AppError::Validation(ERR_BACKUP_FILE_INVALID.to_string()));
  }
  inspect_backup_file(Path::new(path), Some(&state.db_path))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupFileInput {
  pub path: String,
  pub session_token: Option<String>,
}

/// Restore a manually selected backup file after UI confirmation.
/// Safety backup of the live DB is created first and must succeed.
#[tauri::command]
pub async fn restore_db_backup_from_file(
  app: AppHandle,
  state: State<'_, AppState>,
  input: RestoreBackupFileInput,
) -> Result<RestoreOutcome, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
  }
  let path = input.path.trim().to_string();
  if path.is_empty() {
    return Err(AppError::Validation(ERR_BACKUP_FILE_INVALID.to_string()));
  }
  let session_token = input
    .session_token
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let state = state.inner().clone();
  let validated = inspect_backup_file(Path::new(&path), Some(&state.db_path))?;
  let backup_db = PathBuf::from(&validated.path);
  let checksum = validated.checksum.clone().unwrap_or_default();

  let safety_stamp = {
    let conn = state.db.lock();
    if let Some(ref token) = session_token {
      if let Err(e) =
        crate::commands::auth::write_restore_session_bridge(&conn, &state.db_path, token)
      {
        log::warn!("could not save restore session bridge: {e}");
      }
    }
    match create_backup(&conn, &state.db_path, "pre-file-restore") {
      Ok(result) => result.stamp,
      Err(e) => {
        log::error!("safety backup before file restore failed: {e}");
        return Err(AppError::Io(ERR_BACKUP_FILE_SAFETY_FAILED.to_string()));
      }
    }
  };

  {
    let conn = state.db.lock();
    if let Err(e) = stage_backup_file_restore(
      &conn,
      &state.db_path,
      &backup_db,
      &validated.stamp,
      &checksum,
    ) {
      log::error!("stage file restore failed: {e}");
      return Err(AppError::Io(ERR_BACKUP_FILE_RESTORE_FAILED.to_string()));
    }
  }

  match reopen_native_db_after_restore(&app, &state) {
    Ok(applied) => {
      let verified = {
        let conn = state.db.lock();
        verify_saraf_database(&conn)
      };
      if let Err(e) = verified {
        log::error!("file restore verification failed: {e}");
        let _ = rollback_to_safety_backup(&app, &state, &safety_stamp);
        return Err(AppError::Validation(
          ERR_BACKUP_FILE_VERIFY_FAILED.to_string(),
        ));
      }
      Ok(RestoreOutcome {
        stamp: applied.unwrap_or(validated.stamp),
        pending: false,
        message: "Backup restored. Reloading the desk…".into(),
      })
    }
    Err(e) => {
      log::error!("file restore apply failed: {e}");
      let _ = rollback_to_safety_backup(&app, &state, &safety_stamp);
      Err(AppError::Io(ERR_BACKUP_FILE_RESTORE_FAILED.to_string()))
    }
  }
}

fn rollback_to_safety_backup(
  app: &AppHandle,
  state: &AppState,
  safety_stamp: &str,
) -> Result<(), AppError> {
  if let Err(e) = stage_pending_from_stamp(&state.db_path, safety_stamp) {
    log::error!("could not stage safety backup {safety_stamp} after failed file restore: {e}");
    // Best effort: reopen whatever live file is currently on disk.
    if let Err(reopen_err) = reopen_native_db_after_restore(app, state) {
      log::error!("could not reopen database after failed file restore: {reopen_err}");
    }
    return Err(e);
  }
  match reopen_native_db_after_restore(app, state) {
    Ok(_) => {
      let conn = state.db.lock();
      if let Err(e) = verify_saraf_database(&conn) {
        log::error!("safety backup is not usable after rollback: {e}");
        return Err(e);
      }
      log::info!("rolled back file restore using safety backup {safety_stamp}");
      Ok(())
    }
    Err(e) => {
      log::error!("rollback reopen failed: {e}");
      Err(e)
    }
  }
}
