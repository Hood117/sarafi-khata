//! Backup / restore Tauri commands.

use serde::Deserialize;
use tauri::State;

use crate::backup::{
  create_backup, list_backups, restore_backup, BackupListItem, BackupResult, RestoreOutcome,
};
use crate::error::AppError;
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
  create_backup(&conn, &state.db_path, &reason)
}

#[tauri::command]
pub fn list_db_backups(state: State<'_, AppState>) -> Result<Vec<BackupListItem>, AppError> {
  list_backups(&state.db_path)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupInput {
  pub stamp: String,
}

#[tauri::command]
pub fn restore_db_backup(
  state: State<'_, AppState>,
  input: RestoreBackupInput,
) -> Result<RestoreOutcome, AppError> {
  let conn = state.db.lock();
  restore_backup(&conn, &state.db_path, &input.stamp)
}
