//! Single-threaded owner for all `libzkfp.dll` calls.
//!
//! Identify keeps the SDK/device/DB session warm and only rebuilds the in-memory
//! template cache when enrolled fingerprints change. Enroll / verify / capture
//! take exclusive access by releasing that session first.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;

use super::sdk::{
  describe_sdk_code, is_transient_capture_code, DeviceHandle, ZkFpSdk, MAX_TEMPLATE_SIZE,
  ZKFP_ERR_ALREADY_INIT, ZKFP_ERR_NO_DEVICE, ZKFP_ERR_OK, ZKFP_ERR_OPEN,
};
use crate::error::AppError;

const CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(100);
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(30);
/// Responsive poll while listening — finger should register within ~1 tick.
const IDENTIFY_POLL_INTERVAL: Duration = Duration::from_millis(200);
/// Stay on the reader longer so we are not “deaf” between IPC rounds.
const IDENTIFY_TIMEOUT: Duration = Duration::from_secs(8);
const FINGER_OFF_STREAK: u32 = 5;
const ENROLL_SCAN_COUNT: usize = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintDeviceStatus {
  pub available: bool,
  pub device_count: u32,
  /// Set when index 0 was opened successfully during the probe.
  pub probed_device_index: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
  pub dll_loaded_from: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintCaptureResult {
  pub ok: bool,
  /// Opaque ZK template bytes (base64) when `ok` is true.
  pub template_base64: Option<String>,
  pub template_len: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintEnrollResult {
  pub ok: bool,
  /// Merged registration template (base64) when `ok` is true.
  pub template_base64: Option<String>,
  pub template_len: Option<u32>,
  /// How many of the three presses completed before success/failure (0–3).
  pub scans_completed: u32,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintEnrollProgress {
  /// `"scan"` while waiting for a press, `"remove"` while waiting for lift.
  pub phase: String,
  pub scan: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintIdentifyResult {
  pub ok: bool,
  /// Matched customer id when `ok` is true.
  pub customer_id: Option<String>,
  /// SDK match score when identify succeeds.
  pub match_score: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintVerifyResult {
  pub ok: bool,
  /// SDK 1:1 match score when `ok` is true.
  pub match_score: Option<i32>,
  /// Captured probe template (base64) when `ok` is true — saved on hawala collection.
  pub template_base64: Option<String>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

/// One enrolled template to load into the SDK DB cache for 1:N identify.
#[derive(Clone)]
pub struct EnrolledFingerprint {
  pub customer_id: String,
  pub template: Vec<u8>,
}

enum Request {
  DeviceStatus {
    reply: mpsc::Sender<Result<FingerprintDeviceStatus, String>>,
  },
  CaptureOne {
    reply: mpsc::Sender<Result<FingerprintCaptureResult, String>>,
  },
  EnrollThree {
    reply: mpsc::Sender<Result<FingerprintEnrollResult, String>>,
    progress: Option<mpsc::Sender<FingerprintEnrollProgress>>,
  },
  IdentifyOne {
    /// `Some` rebuilds the in-memory DB cache; `None` reuses the warm session.
    enrolled: Option<(String, Vec<EnrolledFingerprint>)>,
    reply: mpsc::Sender<Result<FingerprintIdentifyResult, String>>,
  },
  /// One capture, then 1:1 `DBMatch` against each candidate (best score wins).
  /// Used for hawala collector templates saved from a single verify/capture.
  MatchOneOf {
    candidates: Vec<EnrolledFingerprint>,
    reply: mpsc::Sender<Result<FingerprintIdentifyResult, String>>,
  },
  VerifyOne {
    enrolled_template: Vec<u8>,
    reply: mpsc::Sender<Result<FingerprintVerifyResult, String>>,
  },
  Shutdown,
}

pub struct FingerprintService {
  tx: Sender<Request>,
  /// Only the original service owns the join handle; clones share `tx` only.
  join: Mutex<Option<JoinHandle<()>>>,
}

impl Clone for FingerprintService {
  fn clone(&self) -> Self {
    Self {
      tx: self.tx.clone(),
      join: Mutex::new(None),
    }
  }
}

impl FingerprintService {
  pub fn new() -> Self {
    let (tx, rx) = mpsc::channel();
    let handle = thread::Builder::new()
      .name("zkfp-owner".into())
      .spawn(move || owner_loop(rx))
      .expect("spawn zkfp-owner thread");

    Self {
      tx,
      join: Mutex::new(Some(handle)),
    }
  }

  pub fn device_status(&self) -> Result<FingerprintDeviceStatus, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::DeviceStatus { reply: reply_tx })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }

  pub fn capture_one(&self) -> Result<FingerprintCaptureResult, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::CaptureOne { reply: reply_tx })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }

  pub fn enroll_three(&self) -> Result<FingerprintEnrollResult, AppError> {
    self.enroll_three_with_progress(None)
  }

  pub fn enroll_three_with_progress(
    &self,
    progress: Option<Sender<FingerprintEnrollProgress>>,
  ) -> Result<FingerprintEnrollResult, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::EnrollThree {
        reply: reply_tx,
        progress,
      })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }

  /// Capture one press and identify against enrolled templates via `ZKFPM_DBIdentify`.
  ///
  /// Pass `Some((version, templates))` to (re)load the SDK cache, or `None` to
  /// reuse the warm session without copying templates again.
  pub fn identify_one(
    &self,
    enrolled: Option<(String, Vec<EnrolledFingerprint>)>,
  ) -> Result<FingerprintIdentifyResult, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::IdentifyOne {
        enrolled,
        reply: reply_tx,
      })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }

  /// Capture one press and 1:1-match against many templates; returns the best score.
  pub fn match_one_of(
    &self,
    candidates: Vec<EnrolledFingerprint>,
  ) -> Result<FingerprintIdentifyResult, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::MatchOneOf {
        candidates,
        reply: reply_tx,
      })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }

  /// Capture one press and 1:1-match against a single enrolled template via `ZKFPM_DBMatch`.
  pub fn verify_one(
    &self,
    enrolled_template: Vec<u8>,
  ) -> Result<FingerprintVerifyResult, AppError> {
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::VerifyOne {
        enrolled_template,
        reply: reply_tx,
      })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }
}

impl Drop for FingerprintService {
  fn drop(&mut self) {
    // Clones share `tx` but do not own the owner thread. Only the managed
    // original may shut the loop down — otherwise async identify/enroll
    // clones kill the service on drop ("Fingerprint service is unavailable").
    let owned = self
      .join
      .get_mut()
      .ok()
      .and_then(|slot| slot.take());
    let Some(handle) = owned else {
      return;
    };
    let _ = self.tx.send(Request::Shutdown);
    let _ = handle.join();
  }
}

/// Persistent SDK session for warm identify (device + DB cache stay open).
struct OwnerSession {
  sdk: ZkFpSdk,
  handle: DeviceHandle,
  db: DeviceHandle,
  image: Vec<u8>,
  /// Cheap DB version token (`count|maxUpdatedAt`) for the loaded templates.
  cache_version: String,
  fid_to_customer: Vec<String>,
}

fn owner_loop(rx: Receiver<Request>) {
  let mut session: Option<OwnerSession> = None;
  while let Ok(req) = rx.recv() {
    match req {
      Request::DeviceStatus { reply } => {
        if let Some(ref s) = session {
          let _ = reply.send(Ok(status_from_session(s)));
        } else {
          let _ = reply.send(probe_device_status());
        }
      }
      Request::CaptureOne { reply } => {
        // Exclusive hardware use — drop warm identify session first.
        release_session(&mut session);
        let _ = reply.send(capture_one_fingerprint());
      }
      Request::EnrollThree { reply, progress } => {
        release_session(&mut session);
        let _ = reply.send(enroll_three_scans(progress.as_ref()));
      }
      Request::IdentifyOne { enrolled, reply } => {
        let _ = reply.send(identify_with_session(&mut session, enrolled));
      }
      Request::MatchOneOf { candidates, reply } => {
        release_session(&mut session);
        let _ = reply.send(match_one_of_fingerprints(candidates));
      }
      Request::VerifyOne {
        enrolled_template,
        reply,
      } => {
        release_session(&mut session);
        let _ = reply.send(verify_one_fingerprint(enrolled_template));
      }
      Request::Shutdown => {
        release_session(&mut session);
        break;
      }
    }
  }
  release_session(&mut session);
}

fn status_from_session(session: &OwnerSession) -> FingerprintDeviceStatus {
  FingerprintDeviceStatus {
    available: true,
    device_count: 1,
    probed_device_index: Some(0),
    sdk_error_code: None,
    message: format!(
      "Fingerprint reader ready (warm session, {} template(s) cached).",
      session.fid_to_customer.len()
    ),
    dll_loaded_from: Some(session.sdk.loaded_from.display().to_string()),
  }
}

fn release_session(session: &mut Option<OwnerSession>) {
  if let Some(s) = session.take() {
    let _ = s.sdk.db_free(s.db);
    let _ = s.sdk.close_device(s.handle);
    let _ = s.sdk.terminate();
  }
}

fn ensure_session(session: &mut Option<OwnerSession>) -> Result<&mut OwnerSession, FingerprintIdentifyResult> {
  if session.is_some() {
    return Ok(session.as_mut().unwrap());
  }

  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => return Err(identify_fail(None, e)),
  };

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Err(identify_fail(
      Some(init_code),
      format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
    ));
  }

  let count = sdk.device_count();
  if count <= 0 {
    let _ = sdk.terminate();
    return Err(identify_fail(
      Some(if count < 0 {
        count
      } else {
        ZKFP_ERR_NO_DEVICE
      }),
      "No fingerprint reader detected.".into(),
    ));
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let _ = sdk.terminate();
    return Err(identify_fail(
      Some(ZKFP_ERR_OPEN),
      "ZKFPM_OpenDevice(0) failed.".into(),
    ));
  }

  let db = sdk.db_init();
  if db.is_null() {
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Err(identify_fail(None, "ZKFPM_DBInit failed.".into()));
  }

  let mut width_buf = [0u8; 4];
  let mut height_buf = [0u8; 4];
  let (w_code, _) = match sdk.get_parameters(handle, 1, &mut width_buf) {
    Ok(v) => v,
    Err(e) => {
      let _ = sdk.db_free(db);
      let _ = sdk.close_device(handle);
      let _ = sdk.terminate();
      return Err(identify_fail(None, e));
    }
  };
  let (h_code, _) = match sdk.get_parameters(handle, 2, &mut height_buf) {
    Ok(v) => v,
    Err(e) => {
      let _ = sdk.db_free(db);
      let _ = sdk.close_device(handle);
      let _ = sdk.terminate();
      return Err(identify_fail(None, e));
    }
  };
  if w_code != ZKFP_ERR_OK || h_code != ZKFP_ERR_OK {
    let code = if w_code != ZKFP_ERR_OK { w_code } else { h_code };
    let _ = sdk.db_free(db);
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Err(identify_fail(
      Some(code),
      format!(
        "Failed to read image size ({code}: {})",
        describe_sdk_code(code)
      ),
    ));
  }

  let width = u32::from_le_bytes(width_buf);
  let height = u32::from_le_bytes(height_buf);
  let image_len = (width as usize).saturating_mul(height as usize);
  if width == 0 || height == 0 || image_len == 0 || image_len > 10_000_000 {
    let _ = sdk.db_free(db);
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Err(identify_fail(
      Some(-5),
      format!("Invalid image size from device ({width}x{height})."),
    ));
  }

  *session = Some(OwnerSession {
    sdk,
    handle,
    db,
    image: vec![0u8; image_len],
    cache_version: String::new(),
    fid_to_customer: Vec::new(),
  });
  Ok(session.as_mut().unwrap())
}

fn sync_identify_cache(
  session: &mut OwnerSession,
  version: &str,
  enrolled: &[EnrolledFingerprint],
) -> Result<(), FingerprintIdentifyResult> {
  if version == session.cache_version && !session.fid_to_customer.is_empty() {
    return Ok(());
  }

  let clear_code = session.sdk.db_clear(session.db);
  if clear_code != ZKFP_ERR_OK {
    return Err(identify_fail(
      Some(clear_code),
      format!(
        "ZKFPM_DBClear failed ({clear_code}: {})",
        describe_sdk_code(clear_code)
      ),
    ));
  }

  let mut fid_to_customer: Vec<String> = Vec::with_capacity(enrolled.len());
  for (idx, item) in enrolled.iter().enumerate() {
    let fid = (idx + 1) as u32;
    let add_code = session.sdk.db_add(session.db, fid, &item.template);
    if add_code != ZKFP_ERR_OK {
      session.cache_version.clear();
      session.fid_to_customer.clear();
      return Err(identify_fail(
        Some(add_code),
        format!(
          "ZKFPM_DBAdd failed for customer {} ({add_code}: {})",
          item.customer_id,
          describe_sdk_code(add_code)
        ),
      ));
    }
    fid_to_customer.push(item.customer_id.clone());
  }

  session.cache_version = version.to_string();
  session.fid_to_customer = fid_to_customer;
  Ok(())
}

fn identify_with_session(
  session: &mut Option<OwnerSession>,
  enrolled: Option<(String, Vec<EnrolledFingerprint>)>,
) -> Result<FingerprintIdentifyResult, String> {
  match enrolled {
    Some((version, list)) => {
      if list.is_empty() {
        return Ok(identify_fail(
          None,
          "No enrolled customer fingerprints to match against.".into(),
        ));
      }
      let sess = match ensure_session(session) {
        Ok(s) => s,
        Err(fail) => {
          release_session(session);
          return Ok(fail);
        }
      };
      if let Err(fail) = sync_identify_cache(sess, &version, &list) {
        release_session(session);
        return Ok(fail);
      }
    }
    None => {
      let Some(sess) = session.as_ref() else {
        return Ok(identify_fail(
          None,
          "Identify cache is cold; reload enrolled templates.".into(),
        ));
      };
      if sess.fid_to_customer.is_empty() {
        return Ok(identify_fail(
          None,
          "No enrolled customer fingerprints to match against.".into(),
        ));
      }
    }
  }

  // Re-borrow after optional sync (session still Some).
  let sess = session.as_mut().unwrap();
  let probe = match poll_template_bytes(
    &sess.sdk,
    sess.handle,
    &mut sess.image,
    IDENTIFY_TIMEOUT,
    IDENTIFY_POLL_INTERVAL,
  ) {
    Ok(bytes) => bytes,
    Err(fail) => {
      // Hard device errors: drop warm session so the next call re-opens cleanly.
      let hard = fail
        .sdk_error_code
        .is_some_and(|c| !is_transient_capture_code(c) && c != -28);
      let result = identify_fail(
        fail.sdk_error_code,
        format!("Capture failed: {}", fail.message),
      );
      if hard {
        release_session(session);
      }
      return Ok(result);
    }
  };

  let sess = session.as_mut().unwrap();
  let (id_code, fid, score) = sess.sdk.db_identify(sess.db, &probe);
  if id_code != ZKFP_ERR_OK {
    return Ok(identify_fail(
      Some(id_code),
      format!(
        "No match (ZKFPM_DBIdentify {id_code}: {})",
        describe_sdk_code(id_code)
      ),
    ));
  }

  if fid == 0 || fid as usize > sess.fid_to_customer.len() {
    return Ok(identify_fail(
      Some(id_code),
      format!("Identify returned an unknown finger id ({fid})."),
    ));
  }

  let customer_id = sess.fid_to_customer[(fid as usize) - 1].clone();
  Ok(FingerprintIdentifyResult {
    ok: true,
    customer_id: Some(customer_id),
    match_score: Some(score),
    sdk_error_code: None,
    message: format!("Fingerprint matched (score={score})."),
  })
}

fn probe_device_status() -> Result<FingerprintDeviceStatus, String> {
  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => {
      return Ok(FingerprintDeviceStatus {
        available: false,
        device_count: 0,
        probed_device_index: None,
        sdk_error_code: None,
        message: e,
        dll_loaded_from: None,
      });
    }
  };

  let dll_loaded_from = Some(sdk.loaded_from.display().to_string());
  let mut cleanup_notes: Vec<String> = Vec::new();

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Ok(FingerprintDeviceStatus {
      available: false,
      device_count: 0,
      probed_device_index: None,
      sdk_error_code: Some(init_code),
      message: format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
      dll_loaded_from,
    });
  }

  let count = sdk.device_count();
  if count <= 0 {
    let term = sdk.terminate();
    if term != ZKFP_ERR_OK {
      cleanup_notes.push(format!(
        "ZKFPM_Terminate returned {term} after zero devices"
      ));
    }
    let suffix = if cleanup_notes.is_empty() {
      String::new()
    } else {
      format!(" ({})", cleanup_notes.join("; "))
    };
    return Ok(FingerprintDeviceStatus {
      available: false,
      device_count: 0,
      probed_device_index: None,
      sdk_error_code: if count < 0 {
        Some(count)
      } else {
        Some(super::sdk::ZKFP_ERR_NO_DEVICE)
      },
      message: format!("No fingerprint reader detected.{suffix}"),
      dll_loaded_from,
    });
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let term = sdk.terminate();
    if term != ZKFP_ERR_OK {
      cleanup_notes.push(format!("ZKFPM_Terminate returned {term}"));
    }
    let suffix = if cleanup_notes.is_empty() {
      String::new()
    } else {
      format!(" ({})", cleanup_notes.join("; "))
    };
    return Ok(FingerprintDeviceStatus {
      available: false,
      device_count: count as u32,
      probed_device_index: None,
      sdk_error_code: Some(super::sdk::ZKFP_ERR_OPEN),
      message: format!(
        "Reader reported but ZKFPM_OpenDevice(0) failed.{suffix}"
      ),
      dll_loaded_from,
    });
  }

  let close_code = sdk.close_device(handle);
  if close_code != ZKFP_ERR_OK {
    cleanup_notes.push(format!(
      "ZKFPM_CloseDevice returned {close_code}: {}",
      describe_sdk_code(close_code)
    ));
  }

  let term_code = sdk.terminate();
  if term_code != ZKFP_ERR_OK {
    cleanup_notes.push(format!(
      "ZKFPM_Terminate returned {term_code}: {}",
      describe_sdk_code(term_code)
    ));
  }

  let mut message = format!(
    "Fingerprint reader ready ({} device(s), index 0 opened).",
    count
  );
  if !cleanup_notes.is_empty() {
    message.push(' ');
    message.push_str(&cleanup_notes.join("; "));
  }

  Ok(FingerprintDeviceStatus {
    available: true,
    device_count: count as u32,
    probed_device_index: Some(0),
    sdk_error_code: None,
    message,
    dll_loaded_from,
  })
}

fn capture_one_fingerprint() -> Result<FingerprintCaptureResult, String> {
  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => {
      return Ok(FingerprintCaptureResult {
        ok: false,
        template_base64: None,
        template_len: None,
        sdk_error_code: None,
        message: e,
      });
    }
  };

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Ok(FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(init_code),
      message: format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
    });
  }

  let count = sdk.device_count();
  if count <= 0 {
    let _ = sdk.terminate();
    return Ok(FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(if count < 0 {
        count
      } else {
        ZKFP_ERR_NO_DEVICE
      }),
      message: "No fingerprint reader detected.".into(),
    });
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let _ = sdk.terminate();
    return Ok(FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(ZKFP_ERR_OPEN),
      message: "ZKFPM_OpenDevice(0) failed.".into(),
    });
  }

  let result = capture_with_open_device(&sdk, handle);
  let _ = sdk.close_device(handle);
  let _ = sdk.terminate();
  Ok(result)
}

fn capture_with_open_device(sdk: &ZkFpSdk, handle: super::sdk::DeviceHandle) -> FingerprintCaptureResult {
  let mut width_buf = [0u8; 4];
  let mut height_buf = [0u8; 4];
  let (w_code, _) = match sdk.get_parameters(handle, 1, &mut width_buf) {
    Ok(v) => v,
    Err(e) => {
      return FingerprintCaptureResult {
        ok: false,
        template_base64: None,
        template_len: None,
        sdk_error_code: None,
        message: e,
      };
    }
  };
  let (h_code, _) = match sdk.get_parameters(handle, 2, &mut height_buf) {
    Ok(v) => v,
    Err(e) => {
      return FingerprintCaptureResult {
        ok: false,
        template_base64: None,
        template_len: None,
        sdk_error_code: None,
        message: e,
      };
    }
  };
  if w_code != ZKFP_ERR_OK || h_code != ZKFP_ERR_OK {
    let code = if w_code != ZKFP_ERR_OK { w_code } else { h_code };
    return FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(code),
      message: format!(
        "Failed to read image size ({code}: {})",
        describe_sdk_code(code)
      ),
    };
  }

  let width = u32::from_le_bytes(width_buf);
  let height = u32::from_le_bytes(height_buf);
  let image_len = (width as usize).saturating_mul(height as usize);
  if width == 0 || height == 0 || image_len == 0 || image_len > 10_000_000 {
    return FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(-5),
      message: format!("Invalid image size from device ({width}x{height})."),
    };
  }

  let mut image = vec![0u8; image_len];
  let mut template = vec![0u8; MAX_TEMPLATE_SIZE];
  let deadline = Instant::now() + CAPTURE_TIMEOUT;

  loop {
    if Instant::now() >= deadline {
      return FingerprintCaptureResult {
        ok: false,
        template_base64: None,
        template_len: None,
        sdk_error_code: Some(-28),
        message: "Timed out waiting for a fingerprint. Place a finger on the reader.".into(),
      };
    }

    let (code, template_len) = sdk.acquire_fingerprint(handle, &mut image, &mut template);
    if code == ZKFP_ERR_OK {
      if template_len == 0 || template_len as usize > template.len() {
        return FingerprintCaptureResult {
          ok: false,
          template_base64: None,
          template_len: Some(template_len),
          sdk_error_code: Some(code),
          message: format!("Capture returned an invalid template length ({template_len})."),
        };
      }
      let bytes = &template[..template_len as usize];
      return FingerprintCaptureResult {
        ok: true,
        template_base64: Some(B64.encode(bytes)),
        template_len: Some(template_len),
        sdk_error_code: None,
        message: format!("Fingerprint captured ({template_len} bytes)."),
      };
    }

    if is_transient_capture_code(code) {
      thread::sleep(CAPTURE_POLL_INTERVAL);
      continue;
    }

    return FingerprintCaptureResult {
      ok: false,
      template_base64: None,
      template_len: None,
      sdk_error_code: Some(code),
      message: format!(
        "ZKFPM_AcquireFingerprint failed ({code}: {})",
        describe_sdk_code(code)
      ),
    };
  }
}

fn identify_fail(
  sdk_error_code: Option<i32>,
  message: String,
) -> FingerprintIdentifyResult {
  FingerprintIdentifyResult {
    ok: false,
    customer_id: None,
    match_score: None,
    sdk_error_code,
    message,
  }
}

fn verify_fail(
  sdk_error_code: Option<i32>,
  message: String,
) -> FingerprintVerifyResult {
  FingerprintVerifyResult {
    ok: false,
    match_score: None,
    template_base64: None,
    sdk_error_code,
    message,
  }
}

fn match_one_of_fingerprints(
  candidates: Vec<EnrolledFingerprint>,
) -> Result<FingerprintIdentifyResult, String> {
  if candidates.is_empty() {
    return Ok(identify_fail(
      None,
      "No collector fingerprints to match against.".into(),
    ));
  }

  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => return Ok(identify_fail(None, e)),
  };

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Ok(identify_fail(
      Some(init_code),
      format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
    ));
  }

  let count = sdk.device_count();
  if count <= 0 {
    let _ = sdk.terminate();
    return Ok(identify_fail(
      Some(if count < 0 {
        count
      } else {
        ZKFP_ERR_NO_DEVICE
      }),
      "No fingerprint reader detected.".into(),
    ));
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let _ = sdk.terminate();
    return Ok(identify_fail(
      Some(ZKFP_ERR_OPEN),
      "ZKFPM_OpenDevice(0) failed.".into(),
    ));
  }

  let db = sdk.db_init();
  if db.is_null() {
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Ok(identify_fail(None, "ZKFPM_DBInit failed.".into()));
  }

  let result = match_one_of_with_open_device(&sdk, handle, db, &candidates);
  let _ = sdk.db_free(db);
  let _ = sdk.close_device(handle);
  let _ = sdk.terminate();
  Ok(result)
}

fn match_one_of_with_open_device(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  db: super::sdk::DeviceHandle,
  candidates: &[EnrolledFingerprint],
) -> FingerprintIdentifyResult {
  let mut width_buf = [0u8; 4];
  let mut height_buf = [0u8; 4];
  let (w_code, _) = match sdk.get_parameters(handle, 1, &mut width_buf) {
    Ok(v) => v,
    Err(e) => return identify_fail(None, e),
  };
  let (h_code, _) = match sdk.get_parameters(handle, 2, &mut height_buf) {
    Ok(v) => v,
    Err(e) => return identify_fail(None, e),
  };
  if w_code != ZKFP_ERR_OK || h_code != ZKFP_ERR_OK {
    let code = if w_code != ZKFP_ERR_OK { w_code } else { h_code };
    return identify_fail(
      Some(code),
      format!(
        "Failed to read image size ({code}: {})",
        describe_sdk_code(code)
      ),
    );
  }

  let width = u32::from_le_bytes(width_buf);
  let height = u32::from_le_bytes(height_buf);
  let image_len = (width as usize).saturating_mul(height as usize);
  if width == 0 || height == 0 || image_len == 0 || image_len > 10_000_000 {
    return identify_fail(
      Some(-5),
      format!("Invalid image size from device ({width}x{height})."),
    );
  }

  let mut image = vec![0u8; image_len];
  let probe = match poll_template_bytes(
    sdk,
    handle,
    &mut image,
    IDENTIFY_TIMEOUT,
    IDENTIFY_POLL_INTERVAL,
  ) {
    Ok(bytes) => bytes,
    Err(fail) => {
      return identify_fail(
        fail.sdk_error_code,
        format!("Capture failed: {}", fail.message),
      );
    }
  };

  let mut best: Option<(String, i32)> = None;
  for item in candidates {
    let score = sdk.db_match(db, &item.template, &probe);
    if score <= 0 {
      continue;
    }
    match &best {
      Some((_, best_score)) if score <= *best_score => {}
      _ => best = Some((item.customer_id.clone(), score)),
    }
  }

  match best {
    Some((id, score)) => FingerprintIdentifyResult {
      ok: true,
      customer_id: Some(id),
      match_score: Some(score as u32),
      sdk_error_code: None,
      message: format!("Fingerprint matched (score={score})."),
    },
    None => identify_fail(None, "No match for this fingerprint.".into()),
  }
}

fn verify_one_fingerprint(
  enrolled_template: Vec<u8>,
) -> Result<FingerprintVerifyResult, String> {
  if enrolled_template.is_empty() {
    return Ok(verify_fail(
      None,
      "No enrolled fingerprint template to verify against.".into(),
    ));
  }

  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => return Ok(verify_fail(None, e)),
  };

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Ok(verify_fail(
      Some(init_code),
      format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
    ));
  }

  let count = sdk.device_count();
  if count <= 0 {
    let _ = sdk.terminate();
    return Ok(verify_fail(
      Some(if count < 0 {
        count
      } else {
        ZKFP_ERR_NO_DEVICE
      }),
      "No fingerprint reader detected.".into(),
    ));
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let _ = sdk.terminate();
    return Ok(verify_fail(
      Some(ZKFP_ERR_OPEN),
      "ZKFPM_OpenDevice(0) failed.".into(),
    ));
  }

  let db = sdk.db_init();
  if db.is_null() {
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Ok(verify_fail(None, "ZKFPM_DBInit failed.".into()));
  }

  let result = verify_with_open_device(&sdk, handle, db, &enrolled_template);
  let _ = sdk.db_free(db);
  let _ = sdk.close_device(handle);
  let _ = sdk.terminate();
  Ok(result)
}

fn verify_with_open_device(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  db: super::sdk::DeviceHandle,
  enrolled_template: &[u8],
) -> FingerprintVerifyResult {
  let mut width_buf = [0u8; 4];
  let mut height_buf = [0u8; 4];
  let (w_code, _) = match sdk.get_parameters(handle, 1, &mut width_buf) {
    Ok(v) => v,
    Err(e) => return verify_fail(None, e),
  };
  let (h_code, _) = match sdk.get_parameters(handle, 2, &mut height_buf) {
    Ok(v) => v,
    Err(e) => return verify_fail(None, e),
  };
  if w_code != ZKFP_ERR_OK || h_code != ZKFP_ERR_OK {
    let code = if w_code != ZKFP_ERR_OK { w_code } else { h_code };
    return verify_fail(
      Some(code),
      format!(
        "Failed to read image size ({code}: {})",
        describe_sdk_code(code)
      ),
    );
  }

  let width = u32::from_le_bytes(width_buf);
  let height = u32::from_le_bytes(height_buf);
  let image_len = (width as usize).saturating_mul(height as usize);
  if width == 0 || height == 0 || image_len == 0 || image_len > 10_000_000 {
    return verify_fail(
      Some(-5),
      format!("Invalid image size from device ({width}x{height})."),
    );
  }

  let mut image = vec![0u8; image_len];
  let probe = match poll_template_bytes(
    sdk,
    handle,
    &mut image,
    CAPTURE_TIMEOUT,
    CAPTURE_POLL_INTERVAL,
  ) {
    Ok(bytes) => bytes,
    Err(fail) => {
      return verify_fail(
        fail.sdk_error_code,
        format!("Capture failed: {}", fail.message),
      );
    }
  };

  let score = sdk.db_match(db, enrolled_template, &probe);
  if score <= 0 {
    return verify_fail(
      Some(score),
      format!("Fingerprint did not match (score={score})."),
    );
  }

  FingerprintVerifyResult {
    ok: true,
    match_score: Some(score),
    template_base64: Some(B64.encode(&probe)),
    sdk_error_code: None,
    message: format!("Fingerprint verified (score={score})."),
  }
}

fn enroll_fail(
  scans_completed: u32,
  sdk_error_code: Option<i32>,
  message: String,
) -> FingerprintEnrollResult {
  FingerprintEnrollResult {
    ok: false,
    template_base64: None,
    template_len: None,
    scans_completed,
    sdk_error_code,
    message,
  }
}

fn report_progress(
  progress: Option<&Sender<FingerprintEnrollProgress>>,
  phase: &str,
  scan: u32,
) {
  if let Some(tx) = progress {
    let _ = tx.send(FingerprintEnrollProgress {
      phase: phase.to_string(),
      scan,
    });
    // Brief pause so the UI can paint each step (1 → 2 → 3) before the next poll.
    thread::sleep(Duration::from_millis(90));
  }
}

fn enroll_three_scans(
  progress: Option<&Sender<FingerprintEnrollProgress>>,
) -> Result<FingerprintEnrollResult, String> {
  let sdk = match ZkFpSdk::load() {
    Ok(s) => s,
    Err(e) => return Ok(enroll_fail(0, None, e)),
  };

  let init_code = sdk.init();
  if init_code != ZKFP_ERR_OK && init_code != ZKFP_ERR_ALREADY_INIT {
    return Ok(enroll_fail(
      0,
      Some(init_code),
      format!(
        "ZKFPM_Init failed ({init_code}: {})",
        describe_sdk_code(init_code)
      ),
    ));
  }

  let count = sdk.device_count();
  if count <= 0 {
    let _ = sdk.terminate();
    return Ok(enroll_fail(
      0,
      Some(if count < 0 {
        count
      } else {
        ZKFP_ERR_NO_DEVICE
      }),
      "No fingerprint reader detected.".into(),
    ));
  }

  let handle = sdk.open_device(0);
  if handle.is_null() {
    let _ = sdk.terminate();
    return Ok(enroll_fail(
      0,
      Some(ZKFP_ERR_OPEN),
      "ZKFPM_OpenDevice(0) failed.".into(),
    ));
  }

  let db = sdk.db_init();
  if db.is_null() {
    let _ = sdk.close_device(handle);
    let _ = sdk.terminate();
    return Ok(enroll_fail(
      0,
      None,
      "ZKFPM_DBInit failed.".into(),
    ));
  }

  let result = enroll_with_open_device(&sdk, handle, db, progress);
  let _ = sdk.db_free(db);
  let _ = sdk.close_device(handle);
  let _ = sdk.terminate();
  Ok(result)
}

fn enroll_with_open_device(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  db: super::sdk::DeviceHandle,
  progress: Option<&Sender<FingerprintEnrollProgress>>,
) -> FingerprintEnrollResult {
  let mut width_buf = [0u8; 4];
  let mut height_buf = [0u8; 4];
  let (w_code, _) = match sdk.get_parameters(handle, 1, &mut width_buf) {
    Ok(v) => v,
    Err(e) => return enroll_fail(0, None, e),
  };
  let (h_code, _) = match sdk.get_parameters(handle, 2, &mut height_buf) {
    Ok(v) => v,
    Err(e) => return enroll_fail(0, None, e),
  };
  if w_code != ZKFP_ERR_OK || h_code != ZKFP_ERR_OK {
    let code = if w_code != ZKFP_ERR_OK { w_code } else { h_code };
    return enroll_fail(
      0,
      Some(code),
      format!(
        "Failed to read image size ({code}: {})",
        describe_sdk_code(code)
      ),
    );
  }

  let width = u32::from_le_bytes(width_buf);
  let height = u32::from_le_bytes(height_buf);
  let image_len = (width as usize).saturating_mul(height as usize);
  if width == 0 || height == 0 || image_len == 0 || image_len > 10_000_000 {
    return enroll_fail(
      0,
      Some(-5),
      format!("Invalid image size from device ({width}x{height})."),
    );
  }

  let mut image = vec![0u8; image_len];
  let mut scans: Vec<Vec<u8>> = Vec::with_capacity(ENROLL_SCAN_COUNT);

  for scan_idx in 0..ENROLL_SCAN_COUNT {
    let scan_n = (scan_idx + 1) as u32;
    report_progress(progress, "scan", scan_n);
    match poll_template_bytes(
      sdk,
      handle,
      &mut image,
      CAPTURE_TIMEOUT,
      CAPTURE_POLL_INTERVAL,
    ) {
      Ok(bytes) => {
        if scan_idx > 0 {
          let prev = &scans[scan_idx - 1];
          let score = sdk.db_match(db, prev, &bytes);
          if score <= 0 {
            return enroll_fail(
              scan_idx as u32,
              Some(score),
              format!(
                "Scan {scan_n} does not match the previous finger (score={score}). Use the same finger for all three presses."
              ),
            );
          }
        }
        scans.push(bytes);
        // Mark this step success in the UI as soon as the press is accepted.
        report_progress(progress, "captured", scan_n);
      }
      Err(fail) => {
        return enroll_fail(
          scan_idx as u32,
          fail.sdk_error_code,
          format!("Scan {scan_n} failed: {}", fail.message),
        );
      }
    }

    if scan_idx + 1 < ENROLL_SCAN_COUNT {
      report_progress(progress, "remove", scan_n);
      if let Err(fail) =
        wait_for_finger_removal(sdk, handle, &mut image, CAPTURE_TIMEOUT)
      {
        return enroll_fail(
          scans.len() as u32,
          fail.sdk_error_code,
          format!(
            "After scan {}: {}. Lift your finger, then press again.",
            scan_n, fail.message
          ),
        );
      }
    }
  }

  let mut reg = vec![0u8; MAX_TEMPLATE_SIZE];
  let (merge_code, reg_len) =
    sdk.db_merge(db, &scans[0], &scans[1], &scans[2], &mut reg);
  if merge_code != ZKFP_ERR_OK {
    return enroll_fail(
      3,
      Some(merge_code),
      format!(
        "ZKFPM_DBMerge failed ({merge_code}: {})",
        describe_sdk_code(merge_code)
      ),
    );
  }
  if reg_len == 0 || reg_len as usize > reg.len() {
    return enroll_fail(
      3,
      Some(merge_code),
      format!("Merge returned an invalid template length ({reg_len})."),
    );
  }

  let bytes = &reg[..reg_len as usize];
  FingerprintEnrollResult {
    ok: true,
    template_base64: Some(B64.encode(bytes)),
    template_len: Some(reg_len),
    scans_completed: 3,
    sdk_error_code: None,
    message: format!("Enrollment template ready ({reg_len} bytes from 3 scans)."),
  }
}

struct PollFail {
  sdk_error_code: Option<i32>,
  message: String,
}

fn poll_template_bytes(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  image: &mut [u8],
  timeout: Duration,
  interval: Duration,
) -> Result<Vec<u8>, PollFail> {
  let mut template = vec![0u8; MAX_TEMPLATE_SIZE];
  let deadline = Instant::now() + timeout;

  loop {
    if Instant::now() >= deadline {
      return Err(PollFail {
        sdk_error_code: Some(-28),
        message: "timed out waiting for a fingerprint".into(),
      });
    }

    let (code, template_len) = sdk.acquire_fingerprint(handle, image, &mut template);
    if code == ZKFP_ERR_OK {
      if template_len == 0 || template_len as usize > template.len() {
        return Err(PollFail {
          sdk_error_code: Some(code),
          message: format!("invalid template length ({template_len})"),
        });
      }
      return Ok(template[..template_len as usize].to_vec());
    }

    if is_transient_capture_code(code) {
      thread::sleep(interval);
      continue;
    }

    return Err(PollFail {
      sdk_error_code: Some(code),
      message: format!(
        "ZKFPM_AcquireFingerprint failed ({code}: {})",
        describe_sdk_code(code)
      ),
    });
  }
}

fn wait_for_finger_removal(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  image: &mut [u8],
  timeout: Duration,
) -> Result<(), PollFail> {
  let mut template = vec![0u8; MAX_TEMPLATE_SIZE];
  let deadline = Instant::now() + timeout;
  let mut off_streak = 0u32;

  loop {
    if Instant::now() >= deadline {
      return Err(PollFail {
        sdk_error_code: Some(-28),
        message: "timed out waiting for finger removal".into(),
      });
    }

    let (code, _) = sdk.acquire_fingerprint(handle, image, &mut template);
    if code == ZKFP_ERR_OK {
      off_streak = 0;
      thread::sleep(CAPTURE_POLL_INTERVAL);
      continue;
    }

    if is_transient_capture_code(code) {
      off_streak = off_streak.saturating_add(1);
      if off_streak >= FINGER_OFF_STREAK {
        return Ok(());
      }
      thread::sleep(CAPTURE_POLL_INTERVAL);
      continue;
    }

    return Err(PollFail {
      sdk_error_code: Some(code),
      message: format!(
        "ZKFPM_AcquireFingerprint failed while waiting for lift ({code}: {})",
        describe_sdk_code(code)
      ),
    });
  }
}
