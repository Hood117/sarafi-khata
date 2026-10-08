//! ZKTeco ZKFinger reader hardware layer (Windows, native C API via `libzkfp.dll`).

#[cfg(windows)]
mod win;

#[cfg(not(windows))]
mod stub;

#[cfg(windows)]
pub use win::{
  EnrolledFingerprint, FingerprintCaptureResult, FingerprintDeviceStatus,
  FingerprintEnrollProgress, FingerprintEnrollResult, FingerprintIdentifyResult,
  FingerprintService, FingerprintVerifyResult,
};

#[cfg(not(windows))]
pub use stub::{
  EnrolledFingerprint, FingerprintCaptureResult, FingerprintDeviceStatus,
  FingerprintEnrollProgress, FingerprintEnrollResult, FingerprintIdentifyResult,
  FingerprintService, FingerprintVerifyResult,
};
