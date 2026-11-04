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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintEnrollResult {
  pub ok: bool,
  pub template_base64: Option<String>,
  pub template_len: Option<u32>,
  pub scans_completed: u32,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintEnrollProgress {
  pub phase: String,
  pub scan: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintIdentifyResult {
  pub ok: bool,
  pub customer_id: Option<String>,
  pub match_score: Option<u32>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintVerifyResult {
  pub ok: bool,
  pub match_score: Option<i32>,
  pub template_base64: Option<String>,
  pub sdk_error_code: Option<i32>,
  pub message: String,
}

#[derive(Clone)]
pub struct EnrolledFingerprint {
  pub customer_id: String,
  pub template: Vec<u8>,
}

#[derive(Clone)]
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

  pub fn enroll_three(&self) -> Result<FingerprintEnrollResult, AppError> {
    self.enroll_three_with_progress(None)
  }

  pub fn enroll_three_with_progress(
    &self,
    _progress: Option<std::sync::mpsc::Sender<FingerprintEnrollProgress>>,
  ) -> Result<FingerprintEnrollResult, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }

  pub fn identify_one(
    &self,
    _enrolled: Option<(String, Vec<EnrolledFingerprint>)>,
  ) -> Result<FingerprintIdentifyResult, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }

  pub fn match_one_of(
    &self,
    _candidates: Vec<EnrolledFingerprint>,
  ) -> Result<FingerprintIdentifyResult, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }

  pub fn verify_one(
    &self,
    _enrolled_template: Vec<u8>,
  ) -> Result<FingerprintVerifyResult, AppError> {
    Err(AppError::Internal(
      "Fingerprint reader support is only available on Windows.".into(),
    ))
  }
}
