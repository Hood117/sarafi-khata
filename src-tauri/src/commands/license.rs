//! Local license file + machine fingerprint.
//! Online activation is performed in Rust (APP_TOKEN never leaves the backend).

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::license_config::{APP_TOKEN, LICENSE_API_URL};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseRecord {
  license_key: String,
  machine_fingerprint: String,
  customer_name: Option<String>,
  status: String,
  activated_at: Option<String>,
}

/// Public license gate status — no secrets (no APP_TOKEN).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
  pub licensed: bool,
  pub reason: String,
  pub license_key: Option<String>,
  pub customer_name: Option<String>,
  pub machine_fingerprint: String,
  pub allow_dev_bypass: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseInput {
  pub license_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateApiLicense {
  license_key: Option<String>,
  customer_name: Option<String>,
  status: Option<String>,
  activated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateApiResponse {
  ok: Option<bool>,
  activated: Option<bool>,
  error: Option<String>,
  license: Option<ActivateApiLicense>,
}

fn license_path(app: &AppHandle) -> Result<PathBuf, AppError> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| AppError::Io(format!("app_data_dir: {e}")))?;
  fs::create_dir_all(&data_dir).map_err(|e| AppError::Io(format!("create data dir: {e}")))?;
  Ok(data_dir.join("license.json"))
}

fn machine_fingerprint() -> String {
  let raw = format!(
    "saraf|{}|{}|{}|{}",
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "pc".into()),
    std::env::var("USERNAME").unwrap_or_else(|_| "user".into()),
    std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_else(|_| "cpu".into()),
    std::env::var("SystemRoot").unwrap_or_else(|_| "sys".into()),
  );
  let digest = Sha256::digest(raw.as_bytes());
  hex::encode(digest)
}

fn license_gate_enforced() -> bool {
  if cfg!(debug_assertions) {
    matches!(
      std::env::var("SARAF_REQUIRE_LICENSE").as_deref(),
      Ok("1") | Ok("true") | Ok("yes")
    )
  } else {
    true
  }
}

fn read_license(app: &AppHandle) -> Result<Option<LicenseRecord>, AppError> {
  let path = license_path(app)?;
  if !path.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&path).map_err(|e| AppError::Io(format!("read license: {e}")))?;
  let record: LicenseRecord =
    serde_json::from_str(&raw).map_err(|e| AppError::Io(format!("parse license: {e}")))?;
  Ok(Some(record))
}

fn write_license(app: &AppHandle, record: &LicenseRecord) -> Result<(), AppError> {
  let path = license_path(app)?;
  let raw = serde_json::to_string_pretty(record)
    .map_err(|e| AppError::Internal(format!("serialize license: {e}")))?;
  fs::write(&path, raw).map_err(|e| AppError::Io(format!("write license: {e}")))?;
  Ok(())
}

fn local_ok(app: &AppHandle, fingerprint: &str) -> Result<Option<LicenseRecord>, AppError> {
  let Some(record) = read_license(app)? else {
    return Ok(None);
  };
  if record.status.eq_ignore_ascii_case("active")
    && record.machine_fingerprint == fingerprint
    && !record.license_key.trim().is_empty()
  {
    return Ok(Some(record));
  }
  Ok(None)
}

fn status_from_parts(
  licensed: bool,
  reason: &str,
  license_key: Option<String>,
  customer_name: Option<String>,
  fingerprint: String,
) -> LicenseStatus {
  LicenseStatus {
    licensed,
    reason: reason.into(),
    license_key,
    customer_name,
    machine_fingerprint: fingerprint,
    allow_dev_bypass: cfg!(debug_assertions),
  }
}

/// User-facing copy when activation cannot complete (key / server).
const CONTACT_DEVELOPER_FOR_KEY: &str =
  "Could not activate this key. Contact the developer for a license key.";

/// Distinct from key problems — shop PC often has flaky DNS / blocked Cloudflare.
const NETWORK_ACTIVATION_HINT: &str =
  "Could not reach the license server. Connect to the internet and try again. If it still fails, contact the developer.";

fn activation_user_message(server_error: Option<&str>, http_status: u16) -> String {
  let raw = server_error.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("");
  let lower = raw.to_ascii_lowercase();
  if lower.contains("another computer")
    || lower.contains("already activated")
    || http_status == 409
  {
    return "This key is already in use. Contact the developer for a license key.".into();
  }
  if lower.contains("invalid license")
    || lower.contains("not found")
    || http_status == 404
  {
    return "Invalid license key. Contact the developer for a license key.".into();
  }
  if lower.contains("revoked") || http_status == 403 {
    return "This license was revoked. Contact the developer for a license key.".into();
  }
  if lower.contains("unauthorized") || http_status == 401 {
    return CONTACT_DEVELOPER_FOR_KEY.into();
  }
  if !raw.is_empty() && raw.len() <= 220 {
    // Prefer server text when it already asks to contact the developer.
    if lower.contains("contact") {
      return raw.to_string();
    }
  }
  CONTACT_DEVELOPER_FOR_KEY.into()
}

fn parse_activate_json(raw: &str) -> Result<ActivateApiResponse, AppError> {
  serde_json::from_str(raw).map_err(|e| {
    log::error!("license activate: invalid JSON ({e}); body={}", raw.chars().take(200).collect::<String>());
    AppError::Validation(CONTACT_DEVELOPER_FOR_KEY.into())
  })
}

fn parse_activate_body(response: ureq::Response) -> Result<(u16, ActivateApiResponse), AppError> {
  let http_status = response.status();
  let data = parse_activate_json(
    &response
      .into_string()
      .map_err(|e| {
        log::error!("license activate: body read failed ({e})");
        AppError::Validation(NETWORK_ACTIVATION_HINT.into())
      })?,
  )?;
  Ok((http_status, data))
}

fn license_http_agent() -> ureq::Agent {
  ureq::AgentBuilder::new()
    .timeout_connect(Duration::from_secs(45))
    .timeout_read(Duration::from_secs(60))
    .timeout(Duration::from_secs(90))
    .try_proxy_from_env(true)
    .user_agent("ASMS-Desktop/1.0")
    .build()
}

fn record_from_api(
  license_key: &str,
  fingerprint: &str,
  lic: ActivateApiLicense,
) -> LicenseRecord {
  LicenseRecord {
    license_key: lic
      .license_key
      .unwrap_or_else(|| license_key.to_string())
      .trim()
      .to_ascii_uppercase()
      .replace(' ', ""),
    machine_fingerprint: fingerprint.to_string(),
    customer_name: lic
      .customer_name
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty()),
    status: lic
      .status
      .unwrap_or_else(|| "active".into())
      .trim()
      .to_string(),
    activated_at: lic.activated_at,
  }
}

fn finish_activation(
  license_key: &str,
  fingerprint: &str,
  http_status: u16,
  data: ActivateApiResponse,
) -> Result<LicenseRecord, AppError> {
  if !(200..300).contains(&http_status) || data.ok != Some(true) || data.activated != Some(true)
  {
    log::warn!(
      "license activate rejected: http={http_status} err={:?}",
      data.error
    );
    return Err(AppError::Validation(activation_user_message(
      data.error.as_deref(),
      http_status,
    )));
  }

  let lic = data.license.unwrap_or(ActivateApiLicense {
    license_key: Some(license_key.to_string()),
    customer_name: None,
    status: Some("active".into()),
    activated_at: None,
  });
  Ok(record_from_api(license_key, fingerprint, lic))
}

/// Windows curl.exe uses the same network stack path browsers often use
/// (system proxy / Schannel). Prefer it when ureq cannot reach Cloudflare.
fn activate_via_curl(
  url: &str,
  body_json: &str,
) -> Result<(u16, ActivateApiResponse), String> {
  let curl = if cfg!(windows) { "curl.exe" } else { "curl" };

  let run = |proxy_auto: bool| -> Result<(u16, ActivateApiResponse), String> {
    let mut cmd = Command::new(curl);
    cmd.args([
      "-sS",
      "-L",
      "--connect-timeout",
      "45",
      "--max-time",
      "90",
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-H",
      "Accept: application/json",
      "-H",
      &format!("X-Saraf-App-Token: {APP_TOKEN}"),
      "-H",
      "User-Agent: ASMS-Desktop/1.0 (curl)",
      "--data-binary",
      body_json,
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
      url,
    ]);
    if proxy_auto {
      cmd.arg("--proxy-auto-detect");
    }
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x08000000;
      cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| format!("curl spawn failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() && !stdout.contains("__HTTP_STATUS__:") {
      return Err(format!(
        "curl exit={:?} stderr={}",
        output.status.code(),
        stderr.trim()
      ));
    }

    let (body, status_str) = match stdout.rfind("\n__HTTP_STATUS__:") {
      Some(idx) => {
        let body = stdout[..idx].trim_end_matches(['\r', '\n']);
        let status = stdout[idx + "\n__HTTP_STATUS__:".len()..].trim();
        (body.to_string(), status.to_string())
      }
      None => {
        return Err(format!(
          "curl missing status marker; stderr={} body={}",
          stderr.trim(),
          stdout.chars().take(120).collect::<String>()
        ));
      }
    };
    let http_status: u16 = status_str
      .parse()
      .map_err(|_| format!("curl bad status '{status_str}'"))?;
    let data = parse_activate_json(&body).map_err(|e| e.to_string())?;
    Ok((http_status, data))
  };

  if cfg!(windows) {
    match run(true) {
      Ok(v) => Ok(v),
      Err(e1) => {
        log::warn!("license curl with proxy-auto-detect failed: {e1}");
        run(false).map_err(|e2| format!("{e1} | retry-no-proxy-auto: {e2}"))
      }
    }
  } else {
    run(false)
  }
}

fn activate_via_ureq(
  url: &str,
  body: &serde_json::Value,
) -> Result<(u16, ActivateApiResponse), String> {
  let agent = license_http_agent();
  let mut last_transport = String::new();
  for attempt in 1..=3 {
    match agent
      .post(url)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .set("X-Saraf-App-Token", APP_TOKEN)
      .send_json(body)
    {
      Ok(r) => return parse_activate_body(r).map_err(|e| e.to_string()),
      Err(ureq::Error::Status(_code, r)) => {
        return parse_activate_body(r).map_err(|e| e.to_string());
      }
      Err(e) => {
        last_transport = e.to_string();
        log::error!("license activate ureq error (attempt {attempt}/3): {e}");
        if attempt < 3 {
          std::thread::sleep(Duration::from_millis(700 * attempt as u64));
        }
      }
    }
  }
  Err(last_transport)
}

/// Call the license Worker with the Rust-held APP_TOKEN. Never returns the token.
fn activate_via_license_server(
  license_key: &str,
  fingerprint: &str,
) -> Result<LicenseRecord, AppError> {
  let url = format!(
    "{}/v1/activate",
    LICENSE_API_URL.trim_end_matches('/')
  );
  let body = serde_json::json!({
    "licenseKey": license_key,
    "machineFingerprint": fingerprint,
    "machineLabel": "Desktop",
  });
  let body_str = body.to_string();

  // On Windows, try curl first — it follows system proxy and usually works when
  // embedded ureq cannot reach workers.dev from shop networks.
  let mut errors: Vec<String> = Vec::new();
  if cfg!(windows) {
    match activate_via_curl(&url, &body_str) {
      Ok((status, data)) => {
        log::info!("license activate via curl http={status}");
        return finish_activation(license_key, fingerprint, status, data);
      }
      Err(e) => {
        log::warn!("license activate curl failed: {e}");
        errors.push(format!("curl: {e}"));
      }
    }
  }

  match activate_via_ureq(&url, &body) {
    Ok((status, data)) => {
      log::info!("license activate via ureq http={status}");
      return finish_activation(license_key, fingerprint, status, data);
    }
    Err(e) => {
      log::error!("license activate ureq failed: {e}");
      errors.push(format!("ureq: {e}"));
    }
  }

  // Non-Windows: try curl as last resort too.
  if !cfg!(windows) {
    match activate_via_curl(&url, &body_str) {
      Ok((status, data)) => {
        return finish_activation(license_key, fingerprint, status, data);
      }
      Err(e) => errors.push(format!("curl: {e}")),
    }
  }

  log::error!("license activate all transports failed: {}", errors.join(" | "));
  Err(AppError::Validation(NETWORK_ACTIVATION_HINT.into()))
}

#[tauri::command]
pub fn get_license_status(app: AppHandle) -> Result<LicenseStatus, AppError> {
  let fingerprint = machine_fingerprint();

  if !license_gate_enforced() {
    return Ok(status_from_parts(
      true,
      "dev_bypass",
      None,
      None,
      fingerprint,
    ));
  }

  match local_ok(&app, &fingerprint)? {
    Some(record) => Ok(status_from_parts(
      true,
      "ok",
      Some(record.license_key),
      record.customer_name,
      fingerprint,
    )),
    None => Ok(status_from_parts(
      false,
      "missing",
      None,
      None,
      fingerprint,
    )),
  }
}

/// Activate online via Cloudflare Worker, then persist the local license file.
/// Uses APP_TOKEN only inside Rust — the WebView never receives it.
#[tauri::command]
pub fn activate_license(
  app: AppHandle,
  input: ActivateLicenseInput,
) -> Result<LicenseStatus, AppError> {
  let license_key = input
    .license_key
    .trim()
    .to_ascii_uppercase()
    .replace(' ', "");
  if license_key.is_empty() {
    return Err(AppError::Validation("License key is required.".into()));
  }

  let fingerprint = machine_fingerprint();
  let record = activate_via_license_server(&license_key, &fingerprint)?;
  if record.machine_fingerprint != fingerprint {
    return Err(AppError::Validation(CONTACT_DEVELOPER_FOR_KEY.into()));
  }
  if !record.status.eq_ignore_ascii_case("active") {
    return Err(AppError::Validation(CONTACT_DEVELOPER_FOR_KEY.into()));
  }

  write_license(&app, &record)?;
  get_license_status(app)
}

/// Debug helper: delete local license file so activation can be retested.
#[tauri::command]
pub fn clear_license_dev(app: AppHandle) -> Result<(), AppError> {
  if !cfg!(debug_assertions) {
    return Err(AppError::Validation(
      "clear_license_dev is only available in debug builds.".into(),
    ));
  }
  let path = license_path(&app)?;
  if path.exists() {
    fs::remove_file(&path).map_err(|e| AppError::Io(format!("remove license: {e}")))?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn license_status_json_does_not_expose_app_token() {
    let status = status_from_parts(
      false,
      "missing",
      None,
      None,
      "fp".into(),
    );
    let json = serde_json::to_value(&status).unwrap();
    assert!(json.get("appToken").is_none());
    assert!(json.get("app_token").is_none());
    assert!(json.get("apiUrl").is_none());
    assert_eq!(json.get("licensed").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
      json.get("machineFingerprint").and_then(|v| v.as_str()),
      Some("fp")
    );
  }

  #[test]
  fn app_token_constant_is_not_empty_but_crate_private() {
    // Remains in the binary for server auth; must never be serialized to the UI.
    assert!(!APP_TOKEN.is_empty());
    assert!(!LICENSE_API_URL.is_empty());
  }
}
