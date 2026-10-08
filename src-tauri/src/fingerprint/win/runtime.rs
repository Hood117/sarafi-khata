//! Single-threaded owner for all `libzkfp.dll` calls.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;

use super::sdk::{
  describe_sdk_code, is_transient_capture_code, ZkFpSdk, MAX_TEMPLATE_SIZE,
  ZKFP_ERR_ALREADY_INIT, ZKFP_ERR_NO_DEVICE, ZKFP_ERR_OK, ZKFP_ERR_OPEN,
};
use crate::error::AppError;

const CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(100);
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(30);
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

enum Request {
  DeviceStatus {
    reply: mpsc::Sender<Result<FingerprintDeviceStatus, String>>,
  },
  CaptureOne {
    reply: mpsc::Sender<Result<FingerprintCaptureResult, String>>,
  },
  EnrollThree {
    reply: mpsc::Sender<Result<FingerprintEnrollResult, String>>,
  },
  Shutdown,
}

pub struct FingerprintService {
  tx: Sender<Request>,
  join: Mutex<Option<JoinHandle<()>>>,
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
    let (reply_tx, reply_rx) = mpsc::channel();
    self
      .tx
      .send(Request::EnrollThree { reply: reply_tx })
      .map_err(|_| AppError::Internal("Fingerprint service is unavailable.".into()))?;

    reply_rx
      .recv()
      .map_err(|_| AppError::Internal("Fingerprint service did not respond.".into()))?
      .map_err(AppError::Internal)
  }
}

impl Drop for FingerprintService {
  fn drop(&mut self) {
    let _ = self.tx.send(Request::Shutdown);
    if let Ok(mut guard) = self.join.lock() {
      if let Some(handle) = guard.take() {
        let _ = handle.join();
      }
    }
  }
}

fn owner_loop(rx: Receiver<Request>) {
  while let Ok(req) = rx.recv() {
    match req {
      Request::DeviceStatus { reply } => {
        let _ = reply.send(probe_device_status());
      }
      Request::CaptureOne { reply } => {
        let _ = reply.send(capture_one_fingerprint());
      }
      Request::EnrollThree { reply } => {
        let _ = reply.send(enroll_three_scans());
      }
      Request::Shutdown => break,
    }
  }
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

fn enroll_three_scans() -> Result<FingerprintEnrollResult, String> {
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

  let result = enroll_with_open_device(&sdk, handle, db);
  let _ = sdk.db_free(db);
  let _ = sdk.close_device(handle);
  let _ = sdk.terminate();
  Ok(result)
}

fn enroll_with_open_device(
  sdk: &ZkFpSdk,
  handle: super::sdk::DeviceHandle,
  db: super::sdk::DeviceHandle,
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
    match poll_template_bytes(sdk, handle, &mut image, CAPTURE_TIMEOUT) {
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
      thread::sleep(CAPTURE_POLL_INTERVAL);
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
