//! ZKTeco ZKFinger reader hardware layer (Windows, native C API via `libzkfp.dll`).

#[cfg(windows)]
mod win;

#[cfg(not(windows))]
mod stub;

#[cfg(windows)]
pub use win::{FingerprintCaptureResult, FingerprintDeviceStatus, FingerprintService};

#[cfg(not(windows))]
pub use stub::{FingerprintCaptureResult, FingerprintDeviceStatus, FingerprintService};
