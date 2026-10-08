//! Non-Windows stub — fingerprint hardware is Windows-only.

use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintDeviceStatus {
  pub available: bool,
  pub device_count: u32,
  pub probed_device_index: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
  pub dll_loaded_from: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintCaptureResult {
  pub ok: bool,
  pub template_base64: Option<String>,
  pub template_len: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

pub struct FingerprintService;

impl FingerprintService {
  pub fn new() -> Self {
    Self
  }

  pub fn device_status(&self) -> Result<FingerprintDeviceStatus, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }

  pub fn capture_one(&self) -> Result<FingerprintCaptureResult, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }
}
