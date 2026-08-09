use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
  pub name: String,
  pub version: String,
  pub db_path: String,
  pub backend: String,
}

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> Result<AppInfo, AppError> {
  Ok(AppInfo {
    name: "Saraf".into(),
    version: env!("CARGO_PKG_VERSION").into(),
    db_path: state.db_path.display().to_string(),
    backend: "tauri-rusqlite".into(),
  })
}

#[tauri::command]
pub fn ping() -> Result<&'static str, AppError> {
  Ok("pong")
}
