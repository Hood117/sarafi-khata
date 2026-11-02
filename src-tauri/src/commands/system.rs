use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextExportInput {
  pub filename: String,
  pub contents: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextExportResult {
  pub path: String,
}

fn sanitize_export_filename(name: &str) -> String {
  let base = name
    .trim()
    .chars()
    .map(|c| match c {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
      _ => c,
    })
    .collect::<String>();
  let base = base.trim_matches('.').trim();
  if base.is_empty() {
    "export.csv".into()
  } else {
    base.into()
  }
}

fn downloads_dir() -> PathBuf {
  if let Ok(home) = std::env::var("USERPROFILE") {
    let downloads = PathBuf::from(home).join("Downloads");
    if downloads.is_dir() {
      return downloads;
    }
  }
  if let Ok(home) = std::env::var("HOME") {
    let downloads = PathBuf::from(home).join("Downloads");
    if downloads.is_dir() {
      return downloads;
    }
  }
  std::env::temp_dir()
}

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> Result<AppInfo, AppError> {
  let conn = state.db.lock();
  let name = crate::commands::settings_cmd::resolve_business_name(&conn)?;
  Ok(AppInfo {
    name,
    version: env!("CARGO_PKG_VERSION").into(),
    db_path: state.db_path.display().to_string(),
    backend: "tauri-rusqlite".into(),
  })
}

/// Open the OS print dialog for the current page (WKWebView ignores `window.print()`).
#[tauri::command]
pub fn print_webview(webview: tauri::Webview) -> Result<(), AppError> {
  webview
    .print()
    .map_err(|e| AppError::Internal(format!("Cannot open print dialog: {e}")))
}

fn unique_export_path(dir: &std::path::Path, filename: &str) -> PathBuf {
  let mut path = dir.join(filename);
  if !path.exists() {
    return path;
  }
  let stem = path
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("export");
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("bin");
  let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
  path = dir.join(format!("{stem}-{stamp}.{ext}"));
  path
}

/// Write a text export (CSV, etc.) into the user's Downloads folder.
#[tauri::command]
pub fn save_text_export(input: SaveTextExportInput) -> Result<SaveTextExportResult, AppError> {
  let filename = sanitize_export_filename(&input.filename);
  let dir = downloads_dir();
  fs::create_dir_all(&dir).map_err(|e| AppError::Io(format!("Cannot create export folder: {e}")))?;
  let path = unique_export_path(&dir, &filename);
  fs::write(&path, input.contents.as_bytes())
    .map_err(|e| AppError::Io(format!("Cannot write export file: {e}")))?;
  Ok(SaveTextExportResult {
    path: path.display().to_string(),
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBytesExportInput {
  pub filename: String,
  /// Standard base64 (no data: prefix).
  pub contents_base64: String,
}

/// Write a binary export (PDF, etc.) into the user's Downloads folder.
#[tauri::command]
pub fn save_bytes_export(input: SaveBytesExportInput) -> Result<SaveTextExportResult, AppError> {
  use base64::Engine;
  let filename = sanitize_export_filename(&input.filename);
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(input.contents_base64.trim())
    .map_err(|e| AppError::Validation(format!("Invalid export data: {e}")))?;
  let dir = downloads_dir();
  fs::create_dir_all(&dir).map_err(|e| AppError::Io(format!("Cannot create export folder: {e}")))?;
  let path = unique_export_path(&dir, &filename);
  fs::write(&path, bytes).map_err(|e| AppError::Io(format!("Cannot write export file: {e}")))?;
  Ok(SaveTextExportResult {
    path: path.display().to_string(),
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalUrlInput {
  pub url: String,
}

/// Open a URL with the OS default handler (WhatsApp Desktop, browser, etc.).
#[tauri::command]
pub fn open_external_url(input: OpenExternalUrlInput) -> Result<(), AppError> {
  let url = input.url.trim();
  if url.is_empty() {
    return Err(AppError::Validation("URL is required.".into()));
  }
  let lower = url.to_ascii_lowercase();
  if !(lower.starts_with("https://")
    || lower.starts_with("http://")
    || lower.starts_with("whatsapp://")
    || lower.starts_with("mailto:"))
  {
    return Err(AppError::Validation("Unsupported URL scheme.".into()));
  }

  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // `start` treats the first quoted arg as the window title — pass empty title.
    let status = std::process::Command::new("cmd")
      .args(["/C", "start", "", url])
      .creation_flags(CREATE_NO_WINDOW)
      .status()
      .map_err(|e| AppError::Io(format!("Could not open link: {e}")))?;
    if !status.success() {
      return Err(AppError::Io("Could not open link.".into()));
    }
    return Ok(());
  }

  #[cfg(target_os = "macos")]
  {
    let status = std::process::Command::new("open")
      .arg(url)
      .status()
      .map_err(|e| AppError::Io(format!("Could not open link: {e}")))?;
    if !status.success() {
      return Err(AppError::Io("Could not open link.".into()));
    }
    return Ok(());
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let status = std::process::Command::new("xdg-open")
      .arg(url)
      .status()
      .map_err(|e| AppError::Io(format!("Could not open link: {e}")))?;
    if !status.success() {
      return Err(AppError::Io("Could not open link.".into()));
    }
    return Ok(());
  }

  #[allow(unreachable_code)]
  Err(AppError::Io("Opening links is not supported on this OS.".into()))
}

#[tauri::command]
pub fn ping() -> Result<&'static str, AppError> {
  Ok("pong")
}
