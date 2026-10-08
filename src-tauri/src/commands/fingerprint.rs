use tauri::State;

use crate::error::AppError;
use crate::fingerprint::{
  FingerprintCaptureResult, FingerprintDeviceStatus, FingerprintEnrollResult, FingerprintService,
};

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

/// Three-press enrollment: capture → lift → capture → lift → capture → match → merge.
/// Returns the registration template as base64. Does not persist anything.
#[tauri::command]
pub fn enroll_fingerprint(
  fingerprint: State<'_, FingerprintService>,
) -> Result<FingerprintEnrollResult, AppError> {
  fingerprint.enroll_three()
}
