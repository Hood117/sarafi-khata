use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::OptionalExtension;
use tauri::{AppHandle, Emitter, State};

use crate::commands::authorize::{
  require_any_screen, require_screen, require_screen_write, require_user_admin,
};
use crate::error::AppError;
use crate::fingerprint::{
  EnrolledFingerprint, FingerprintCaptureResult, FingerprintDeviceStatus,
  FingerprintEnrollProgress, FingerprintEnrollResult, FingerprintIdentifyResult,
  FingerprintService, FingerprintVerifyResult,
};
use crate::state::AppState;
use crate::util::now_sqlite;

/// How often a warm identify path rechecks SQLite for enroll/delete changes.
const ENROLLED_VERSION_RECHECK: Duration = Duration::from_secs(15);

/// Decoded templates keyed by a cheap SQLite version token — avoids reloading on
/// every global identify tick.
struct EnrolledTemplateCache {
  version: String,
  /// True once the warm owner session has been seeded with this version.
  seeded_on_device: bool,
  enrolled: Vec<EnrolledFingerprint>,
  last_version_check: Instant,
}

fn enrolled_template_cache() -> &'static Mutex<Option<EnrolledTemplateCache>> {
  static CACHE: OnceLock<Mutex<Option<EnrolledTemplateCache>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(None))
}

fn clear_enrolled_template_cache() {
  if let Ok(mut guard) = enrolled_template_cache().lock() {
    *guard = None;
  }
}

fn enrolled_version(conn: &rusqlite::Connection) -> Result<String, AppError> {
  let (count, max_updated): (i64, Option<String>) = conn.query_row(
    r#"SELECT COUNT(*), MAX(updatedAt)
       FROM Customer
       WHERE deletedAt IS NULL
         AND fingerprintTemplate IS NOT NULL
         AND TRIM(fingerprintTemplate) != ''"#,
    [],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  Ok(format!("{count}|{}", max_updated.unwrap_or_default()))
}

fn load_enrolled_templates(
  conn: &rusqlite::Connection,
) -> Result<Vec<EnrolledFingerprint>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT id, fingerprintTemplate FROM Customer
       WHERE deletedAt IS NULL
         AND fingerprintTemplate IS NOT NULL
         AND TRIM(fingerprintTemplate) != ''"#,
  )?;
  let rows = stmt.query_map([], |row| {
    let id: String = row.get(0)?;
    let template_b64: String = row.get(1)?;
    Ok((id, template_b64))
  })?;

  let mut out = Vec::new();
  for row in rows {
    let (customer_id, template_b64) = row?;
    let Ok(template) = B64.decode(template_b64.trim()) else {
      continue;
    };
    if template.is_empty() {
      continue;
    }
    out.push(EnrolledFingerprint {
      customer_id,
      template,
    });
  }
  Ok(out)
}

/// Probe the ZKTeco reader: init → device count → open index 0 → close → terminate.
/// All SDK work runs on the dedicated fingerprint owner thread.
#[tauri::command]
pub fn get_fingerprint_device_status(
  fingerprint: State<'_, FingerprintService>,
) -> Result<FingerprintDeviceStatus, AppError> {
  fingerprint.device_status()
}

/// Capture one fingerprint template from device index 0 (poll until success, error, or timeout).
/// Does not persist anything. SDK work stays on the fingerprint owner thread.
#[tauri::command]
pub fn capture_fingerprint(
  fingerprint: State<'_, FingerprintService>,
) -> Result<FingerprintCaptureResult, AppError> {
  fingerprint.capture_one()
}

/// Three-press enrollment for an existing customer; saves template only on success.
/// Emits `fingerprint-enroll-progress` events (`phase` + `scan`) during the flow.
/// Runs off the async runtime so each scan/lift event can paint in the UI live.
#[tauri::command]
pub async fn enroll_fingerprint(
  app: AppHandle,
  fingerprint: State<'_, FingerprintService>,
  state: State<'_, AppState>,
  customer_id: String,
) -> Result<FingerprintEnrollResult, AppError> {
  let customer_id = customer_id.trim().to_string();
  if customer_id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }

  {
    let conn = state.db.lock();
    let _actor = require_screen_write(&state, &conn, "customers")?;
    let exists: Option<String> = conn
      .query_row(
        r#"SELECT id FROM Customer
           WHERE id = ?1 AND deletedAt IS NULL
           LIMIT 1"#,
        [&customer_id],
        |row| row.get(0),
      )
      .optional()?;
    if exists.is_none() {
      return Err(AppError::NotFound("Customer not found.".into()));
    }
  }

  let (progress_tx, progress_rx) = mpsc::channel::<FingerprintEnrollProgress>();
  let app_for_progress = app.clone();
  thread::spawn(move || {
    while let Ok(ev) = progress_rx.recv() {
      let _ = app_for_progress.emit("fingerprint-enroll-progress", &ev);
    }
  });

  let fingerprint = fingerprint.inner().clone();
  let mut result = tauri::async_runtime::spawn_blocking(move || {
    fingerprint.enroll_three_with_progress(Some(progress_tx))
  })
  .await
  .map_err(|e| AppError::Internal(format!("Enrollment task failed: {e}")))??;
  if !result.ok {
    return Ok(result);
  }

  let Some(template) = result.template_base64.clone() else {
    return Ok(FingerprintEnrollResult {
      ok: false,
      template_base64: None,
      template_len: None,
      scans_completed: result.scans_completed,
      sdk_error_code: None,
      message: "Enrollment succeeded but no template was returned; nothing was saved.".into(),
    });
  };

  let conn = state.db.lock();
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE Customer
       SET fingerprintTemplate = ?1, updatedAt = ?2
       WHERE id = ?3 AND deletedAt IS NULL"#,
    rusqlite::params![template, now, customer_id],
  )?;
  if updated != 1 {
    return Err(AppError::NotFound(
      "Customer not found; fingerprint was not saved.".into(),
    ));
  }

  clear_enrolled_template_cache();
  result.message = format!("{} Saved to customer.", result.message.trim_end_matches('.'));
  Ok(result)
}

/// Capture one fingerprint and identify against enrolled customer templates (1:N).
/// Read-only on customer data; ignores customers with no fingerprint template.
///
/// Hot path: after the first successful load, only a cheap `COUNT/MAX(updatedAt)`
/// check hits SQLite; the warm SDK session is reused with no template copies.
///
/// Async + `spawn_blocking`: Tauri runs sync commands on the **main** thread, and
/// `identify_one` blocks up to the listen window (~8s) on the owner reply. That
/// froze desk UI while the global listener was active. Auth/cache stay brief and
/// sync; only the device wait leaves the main/async executor.
#[tauri::command]
pub async fn identify_fingerprint(
  fingerprint: State<'_, FingerprintService>,
  state: State<'_, AppState>,
) -> Result<FingerprintIdentifyResult, AppError> {
  // Resolve templates under short-lived locks, then release before the device poll.
  let refresh = {
    let conn = state.db.lock();
    let _actor = require_screen(&state, &conn, "customers")?;

    let mut guard = enrolled_template_cache()
      .lock()
      .map_err(|_| AppError::Internal("Fingerprint template cache is poisoned.".into()))?;

    let warm_skip = guard.as_ref().is_some_and(|cache| {
      cache.seeded_on_device
        && !cache.enrolled.is_empty()
        && cache.last_version_check.elapsed() < ENROLLED_VERSION_RECHECK
    });
    if warm_skip {
      None
    } else {
      let version = enrolled_version(&conn)?;
      let needs_reload = match guard.as_ref() {
        Some(cache) => cache.version != version,
        None => true,
      };

      if needs_reload {
        let enrolled = load_enrolled_templates(&conn)?;
        *guard = Some(EnrolledTemplateCache {
          version: version.clone(),
          seeded_on_device: false,
          enrolled: enrolled.clone(),
          last_version_check: Instant::now(),
        });
        Some((version, enrolled))
      } else if guard.as_ref().is_some_and(|c| !c.seeded_on_device) {
        let cache = guard.as_mut().unwrap();
        cache.last_version_check = Instant::now();
        Some((cache.version.clone(), cache.enrolled.clone()))
      } else if let Some(cache) = guard.as_mut() {
        cache.last_version_check = Instant::now();
        None
      } else {
        None
      }
    }
  };

  let sent_templates = refresh.is_some();
  let fingerprint = fingerprint.inner().clone();
  let result = tauri::async_runtime::spawn_blocking(move || fingerprint.identify_one(refresh))
    .await
    .map_err(|e| AppError::Internal(format!("Identify task failed: {e}")))??;

  // Keep the process cache aligned with the warm owner session. If the device
  // session was dropped, the next tick re-sends templates once.
  if let Ok(mut guard) = enrolled_template_cache().lock() {
    if let Some(cache) = guard.as_mut() {
      let cold_miss = result
        .message
        .to_lowercase()
        .contains("identify cache is cold");
      if cold_miss {
        cache.seeded_on_device = false;
      } else if sent_templates {
        cache.seeded_on_device = !cache.enrolled.is_empty();
      }
    }
  }

  Ok(result)
}

/// Capture the collector's finger when completing a receive hawala.
///
/// Works for walk-ins and permanent customers alike: one press on the reader is
/// enough. If that person already has an enrolled template (matched by linked
/// customer / national ID / phone), we also 1:1-check the finger. Otherwise the
/// capture alone counts as verified presence — national ID & phone are saved on
/// complete.
#[tauri::command]
pub fn verify_hawala_collector_fingerprint(
  fingerprint: State<'_, FingerprintService>,
  state: State<'_, AppState>,
  hawala_id: String,
  receiver_national_id: Option<String>,
  receiver_phone: Option<String>,
) -> Result<FingerprintVerifyResult, AppError> {
  let hawala_id = hawala_id.trim().to_string();
  if hawala_id.is_empty() {
    return Err(AppError::Validation("Hawala id is required.".into()));
  }

  let form_national_id = receiver_national_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_string);
  let form_phone = receiver_phone
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_string);

  let enrolled_template = {
    let conn = state.db.lock();
    let _actor = require_any_screen(&state, &conn, &["hawala", "customers"])?;

    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = conn
      .query_row(
        r#"SELECT direction, receiverCustomerId, receiverNationalId, receiverPhone
           FROM HawalaTransfer
           WHERE id = ?1 AND deletedAt IS NULL
           LIMIT 1"#,
        [&hawala_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
      )
      .optional()?;

    let Some((direction, receiver_customer_id, hawala_national_id, hawala_phone)) = row
    else {
      return Err(AppError::NotFound("Hawala not found.".into()));
    };
    if !direction.eq_ignore_ascii_case("RECEIVE") {
      return Err(AppError::Validation(
        "Fingerprint verify is only for receive (collection) hawalas.".into(),
      ));
    }

    let national_id = form_national_id.or_else(|| {
      hawala_national_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
    });
    let phone = form_phone.or_else(|| {
      hawala_phone
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
    });

    // Optional: only used when an enrolled permanent/temp customer is found.
    find_enrolled_collector_template(
      &conn,
      receiver_customer_id.as_deref(),
      national_id.as_deref(),
      phone.as_deref(),
    )?
  };

  // Walk-in (no enrolled template): one capture = verified.
  let Some(enrolled) = enrolled_template else {
    let capture = fingerprint.capture_one()?;
    if capture.ok {
      return Ok(FingerprintVerifyResult {
        ok: true,
        match_score: None,
        sdk_error_code: None,
        message: "Fingerprint captured. You can complete the hawala.".into(),
      });
    }
    return Ok(FingerprintVerifyResult {
      ok: false,
      match_score: None,
      sdk_error_code: capture.sdk_error_code,
      message: capture.message,
    });
  };

  // Enrolled collector: capture + 1:1 match.
  let mut result = fingerprint.verify_one(enrolled)?;
  if result.ok && result.message.trim().is_empty() {
    result.message = "Fingerprint verified. You can complete the hawala.".into();
  }
  Ok(result)
}

/// Soft lookup — returns `None` for walk-ins (no error).
fn find_enrolled_collector_template(
  conn: &rusqlite::Connection,
  receiver_customer_id: Option<&str>,
  receiver_national_id: Option<&str>,
  receiver_phone: Option<&str>,
) -> Result<Option<Vec<u8>>, AppError> {
  let customer_id = if let Some(id) = receiver_customer_id.map(str::trim).filter(|s| !s.is_empty())
  {
    Some(id.to_string())
  } else if let Some(national_id) = receiver_national_id.map(str::trim).filter(|s| !s.is_empty()) {
    conn
      .query_row(
        r#"SELECT id FROM Customer
           WHERE deletedAt IS NULL
             AND TRIM(IFNULL(nationalId, '')) = ?1
             AND fingerprintTemplate IS NOT NULL
             AND TRIM(fingerprintTemplate) != ''
           ORDER BY updatedAt DESC
           LIMIT 1"#,
        [national_id],
        |r| r.get(0),
      )
      .optional()?
  } else if let Some(phone) = receiver_phone.map(str::trim).filter(|s| !s.is_empty()) {
    conn
      .query_row(
        r#"SELECT id FROM Customer
           WHERE deletedAt IS NULL
             AND TRIM(IFNULL(phone, '')) = ?1
             AND fingerprintTemplate IS NOT NULL
             AND TRIM(fingerprintTemplate) != ''
           ORDER BY updatedAt DESC
           LIMIT 1"#,
        [phone],
        |r| r.get(0),
      )
      .optional()?
  } else {
    None
  };

  let Some(customer_id) = customer_id else {
    return Ok(None);
  };

  let template_b64: Option<String> = conn
    .query_row(
      r#"SELECT fingerprintTemplate FROM Customer
         WHERE id = ?1 AND deletedAt IS NULL
         LIMIT 1"#,
      [&customer_id],
      |r| r.get(0),
    )
    .optional()?
    .flatten();

  let Some(raw) = template_b64.filter(|s| !s.trim().is_empty()) else {
    return Ok(None);
  };
  let Ok(bytes) = B64.decode(raw.trim()) else {
    return Ok(None);
  };
  if bytes.is_empty() {
    return Ok(None);
  }
  Ok(Some(bytes))
}

/// Three-press enrollment for an existing desk user; saves template for fingerprint sign-in.
#[tauri::command]
pub async fn enroll_user_fingerprint(
  app: AppHandle,
  fingerprint: State<'_, FingerprintService>,
  state: State<'_, AppState>,
  user_id: String,
) -> Result<FingerprintEnrollResult, AppError> {
  let user_id = user_id.trim().to_string();
  if user_id.is_empty() {
    return Err(AppError::Validation("User id is required.".into()));
  }

  {
    let conn = state.db.lock();
    let _actor = require_user_admin(&state, &conn)?;
    let exists: Option<String> = conn
      .query_row(
        r#"SELECT id FROM User WHERE id = ?1 LIMIT 1"#,
        [&user_id],
        |row| row.get(0),
      )
      .optional()?;
    if exists.is_none() {
      return Err(AppError::NotFound("User not found.".into()));
    }
  }

  let (progress_tx, progress_rx) = mpsc::channel::<FingerprintEnrollProgress>();
  let app_for_progress = app.clone();
  thread::spawn(move || {
    while let Ok(ev) = progress_rx.recv() {
      let _ = app_for_progress.emit("fingerprint-enroll-progress", &ev);
    }
  });

  let fingerprint = fingerprint.inner().clone();
  let mut result = tauri::async_runtime::spawn_blocking(move || {
    fingerprint.enroll_three_with_progress(Some(progress_tx))
  })
  .await
  .map_err(|e| AppError::Internal(format!("Enrollment task failed: {e}")))??;
  if !result.ok {
    return Ok(result);
  }

  let Some(template) = result.template_base64.clone() else {
    return Ok(FingerprintEnrollResult {
      ok: false,
      template_base64: None,
      template_len: None,
      scans_completed: result.scans_completed,
      sdk_error_code: None,
      message: "Enrollment succeeded but no template was returned; nothing was saved.".into(),
    });
  };

  let conn = state.db.lock();
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE User
       SET fingerprintTemplate = ?1, updatedAt = ?2
       WHERE id = ?3"#,
    rusqlite::params![template, now, user_id],
  )?;
  if updated != 1 {
    return Err(AppError::NotFound(
      "User not found; fingerprint was not saved.".into(),
    ));
  }

  result.message = format!("{} Saved for desk sign-in.", result.message.trim_end_matches('.'));
  Ok(result)
}

/// Remove an enrolled desk-user fingerprint (admin only).
#[tauri::command]
pub fn clear_user_fingerprint(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<(), AppError> {
  let user_id = user_id.trim().to_string();
  if user_id.is_empty() {
    return Err(AppError::Validation("User id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_user_admin(&state, &conn)?;
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE User
       SET fingerprintTemplate = NULL, updatedAt = ?1
       WHERE id = ?2"#,
    rusqlite::params![now, user_id],
  )?;
  if updated != 1 {
    return Err(AppError::NotFound("User not found.".into()));
  }
  Ok(())
}
