//! Dynamic load of `libzkfp.dll` (ZKFinger Standard SDK 5.x C API).

use std::ffi::c_void;
use std::path::{Path, PathBuf};

use libloading::{Library, Symbol};

pub type DeviceHandle = *mut c_void;

pub const ZKFP_ERR_ALREADY_INIT: i32 = 1;
pub const ZKFP_ERR_OK: i32 = 0;
pub const ZKFP_ERR_NO_DEVICE: i32 = -3;
pub const ZKFP_ERR_OPEN: i32 = -6;
pub const ZKFP_ERR_CAPTURE: i32 = -8;
pub const ZKFP_ERR_BUSY: i32 = -12;
pub const ZKFP_ERR_MERGE: i32 = -22;

pub const MAX_TEMPLATE_SIZE: usize = 2048;

type ZkfpmInit = unsafe extern "system" fn() -> i32;
type ZkfpmTerminate = unsafe extern "system" fn() -> i32;
type ZkfpmGetDeviceCount = unsafe extern "system" fn() -> i32;
type ZkfpmOpenDevice = unsafe extern "system" fn(index: i32) -> DeviceHandle;
type ZkfpmCloseDevice = unsafe extern "system" fn(h_device: DeviceHandle) -> i32;
type ZkfpmGetParameters = unsafe extern "system" fn(
  h_device: DeviceHandle,
  n_param_code: i32,
  param_value: *mut u8,
  cb_param_value: *mut u32,
) -> i32;
type ZkfpmAcquireFingerprint = unsafe extern "system" fn(
  h_device: DeviceHandle,
  fp_image: *mut u8,
  cb_fp_image: u32,
  fp_template: *mut u8,
  cb_template: *mut u32,
) -> i32;
type ZkfpmDbInit = unsafe extern "system" fn() -> DeviceHandle;
type ZkfpmDbFree = unsafe extern "system" fn(h_db: DeviceHandle) -> i32;
type ZkfpmDbMatch = unsafe extern "system" fn(
  h_db: DeviceHandle,
  template1: *const u8,
  cb_template1: u32,
  template2: *const u8,
  cb_template2: u32,
) -> i32;
type ZkfpmDbMerge = unsafe extern "system" fn(
  h_db: DeviceHandle,
  temp1: *const u8,
  temp2: *const u8,
  temp3: *const u8,
  reg_temp: *mut u8,
  cb_reg_temp: *mut u32,
) -> i32;
type ZkfpmDbAdd = unsafe extern "system" fn(
  h_db: DeviceHandle,
  fid: u32,
  fp_template: *const u8,
  cb_template: u32,
) -> i32;
type ZkfpmDbClear = unsafe extern "system" fn(h_db: DeviceHandle) -> i32;
type ZkfpmDbIdentify = unsafe extern "system" fn(
  h_db: DeviceHandle,
  fp_template: *const u8,
  cb_template: u32,
  fid: *mut u32,
  score: *mut u32,
) -> i32;

pub struct ZkFpSdk {
  _library: Library,
  pub loaded_from: PathBuf,
  init: ZkfpmInit,
  terminate: ZkfpmTerminate,
  get_device_count: ZkfpmGetDeviceCount,
  open_device: ZkfpmOpenDevice,
  close_device: ZkfpmCloseDevice,
  get_parameters: ZkfpmGetParameters,
  acquire_fingerprint: ZkfpmAcquireFingerprint,
  db_init: ZkfpmDbInit,
  db_free: ZkfpmDbFree,
  db_match: ZkfpmDbMatch,
  db_merge: ZkfpmDbMerge,
  db_add: ZkfpmDbAdd,
  db_clear: ZkfpmDbClear,
  db_identify: ZkfpmDbIdentify,
}

impl ZkFpSdk {
  pub fn load() -> Result<Self, String> {
    let (library, loaded_from) = load_library()?;
    // SAFETY: symbols match ZKTeco libzkfp.dll exports on x64 Windows.
    unsafe {
      let init: Symbol<ZkfpmInit> = library
        .get(b"ZKFPM_Init")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_Init: {e}"))?;
      let terminate: Symbol<ZkfpmTerminate> = library
        .get(b"ZKFPM_Terminate")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_Terminate: {e}"))?;
      let get_device_count: Symbol<ZkfpmGetDeviceCount> = library
        .get(b"ZKFPM_GetDeviceCount")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_GetDeviceCount: {e}"))?;
      let open_device: Symbol<ZkfpmOpenDevice> = library
        .get(b"ZKFPM_OpenDevice")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_OpenDevice: {e}"))?;
      let close_device: Symbol<ZkfpmCloseDevice> = library
        .get(b"ZKFPM_CloseDevice")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_CloseDevice: {e}"))?;
      let get_parameters: Symbol<ZkfpmGetParameters> = library
        .get(b"ZKFPM_GetParameters")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_GetParameters: {e}"))?;
      let acquire_fingerprint: Symbol<ZkfpmAcquireFingerprint> = library
        .get(b"ZKFPM_AcquireFingerprint")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_AcquireFingerprint: {e}"))?;
      let db_init: Symbol<ZkfpmDbInit> = library
        .get(b"ZKFPM_DBInit")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBInit: {e}"))?;
      let db_free: Symbol<ZkfpmDbFree> = library
        .get(b"ZKFPM_DBFree")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBFree: {e}"))?;
      let db_match: Symbol<ZkfpmDbMatch> = library
        .get(b"ZKFPM_DBMatch")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBMatch: {e}"))?;
      let db_merge: Symbol<ZkfpmDbMerge> = library
        .get(b"ZKFPM_DBMerge")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBMerge: {e}"))?;
      let db_add: Symbol<ZkfpmDbAdd> = library
        .get(b"ZKFPM_DBAdd")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBAdd: {e}"))?;
      let db_clear: Symbol<ZkfpmDbClear> = library
        .get(b"ZKFPM_DBClear")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBClear: {e}"))?;
      let db_identify: Symbol<ZkfpmDbIdentify> = library
        .get(b"ZKFPM_DBIdentify")
        .map_err(|e| format!("libzkfp.dll missing ZKFPM_DBIdentify: {e}"))?;

      Ok(Self {
        init: *init,
        terminate: *terminate,
        get_device_count: *get_device_count,
        open_device: *open_device,
        close_device: *close_device,
        get_parameters: *get_parameters,
        acquire_fingerprint: *acquire_fingerprint,
        db_init: *db_init,
        db_free: *db_free,
        db_match: *db_match,
        db_merge: *db_merge,
        db_add: *db_add,
        db_clear: *db_clear,
        db_identify: *db_identify,
        loaded_from,
        _library: library,
      })
    }
  }

  pub fn init(&self) -> i32 {
    unsafe { (self.init)() }
  }

  pub fn terminate(&self) -> i32 {
    unsafe { (self.terminate)() }
  }

  pub fn device_count(&self) -> i32 {
    unsafe { (self.get_device_count)() }
  }

  pub fn open_device(&self, index: i32) -> DeviceHandle {
    unsafe { (self.open_device)(index) }
  }

  pub fn close_device(&self, handle: DeviceHandle) -> i32 {
    unsafe { (self.close_device)(handle) }
  }

  pub fn get_parameters(
    &self,
    handle: DeviceHandle,
    n_param_code: i32,
    param_value: &mut [u8],
  ) -> Result<(i32, u32), String> {
    let mut cb = param_value.len() as u32;
    let code = unsafe {
      (self.get_parameters)(
        handle,
        n_param_code,
        param_value.as_mut_ptr(),
        &mut cb,
      )
    };
    Ok((code, cb))
  }

  pub fn acquire_fingerprint(
    &self,
    handle: DeviceHandle,
    fp_image: &mut [u8],
    fp_template: &mut [u8],
  ) -> (i32, u32) {
    let mut cb_template = fp_template.len() as u32;
    let code = unsafe {
      (self.acquire_fingerprint)(
        handle,
        fp_image.as_mut_ptr(),
        fp_image.len() as u32,
        fp_template.as_mut_ptr(),
        &mut cb_template,
      )
    };
    (code, cb_template)
  }

  pub fn db_init(&self) -> DeviceHandle {
    unsafe { (self.db_init)() }
  }

  pub fn db_free(&self, h_db: DeviceHandle) -> i32 {
    unsafe { (self.db_free)(h_db) }
  }

  pub fn db_match(&self, h_db: DeviceHandle, a: &[u8], b: &[u8]) -> i32 {
    unsafe {
      (self.db_match)(
        h_db,
        a.as_ptr(),
        a.len() as u32,
        b.as_ptr(),
        b.len() as u32,
      )
    }
  }

  pub fn db_merge(
    &self,
    h_db: DeviceHandle,
    t1: &[u8],
    t2: &[u8],
    t3: &[u8],
    reg_temp: &mut [u8],
  ) -> (i32, u32) {
    let mut cb = reg_temp.len() as u32;
    let code = unsafe {
      (self.db_merge)(
        h_db,
        t1.as_ptr(),
        t2.as_ptr(),
        t3.as_ptr(),
        reg_temp.as_mut_ptr(),
        &mut cb,
      )
    };
    (code, cb)
  }

  pub fn db_add(&self, h_db: DeviceHandle, fid: u32, template: &[u8]) -> i32 {
    unsafe { (self.db_add)(h_db, fid, template.as_ptr(), template.len() as u32) }
  }

  pub fn db_clear(&self, h_db: DeviceHandle) -> i32 {
    unsafe { (self.db_clear)(h_db) }
  }

  pub fn db_identify(&self, h_db: DeviceHandle, template: &[u8]) -> (i32, u32, u32) {
    let mut fid = 0u32;
    let mut score = 0u32;
    let code = unsafe {
      (self.db_identify)(
        h_db,
        template.as_ptr(),
        template.len() as u32,
        &mut fid,
        &mut score,
      )
    };
    (code, fid, score)
  }
}

fn load_library() -> Result<(Library, PathBuf), String> {
  let mut errors: Vec<String> = Vec::new();

  if let Ok(from_env) = std::env::var("SARAF_ZKFP_DLL_DIR") {
    let dir = PathBuf::from(from_env);
    let candidate = dir.join("libzkfp.dll");
    match try_load_path(&candidate) {
      Ok(pair) => return Ok(pair),
      Err(e) => errors.push(e),
    }
  }

  match try_load_path(Path::new("libzkfp.dll")) {
    Ok(pair) => return Ok(pair),
    Err(e) => errors.push(e),
  }

  if let Ok(system_root) = std::env::var("SystemRoot") {
    let candidate = PathBuf::from(system_root)
      .join("System32")
      .join("libzkfp.dll");
    match try_load_path(&candidate) {
      Ok(pair) => return Ok(pair),
      Err(e) => errors.push(e),
    }
  }

  Err(format!(
    "Could not load libzkfp.dll (install ZKFinger Standard SDK driver 5.3.x). Attempts: {}",
    errors.join("; ")
  ))
}

fn try_load_path(path: &Path) -> Result<(Library, PathBuf), String> {
  let display = path.display().to_string();
  unsafe { Library::new(path) }
    .map(|lib| (lib, path.to_path_buf()))
    .map_err(|e| format!("{display}: {e}"))
}

pub fn describe_sdk_code(code: i32) -> &'static str {
  match code {
    ZKFP_ERR_OK => "ok",
    ZKFP_ERR_ALREADY_INIT => "already initialized",
    -1 => "failed to initialize algorithm library",
    -2 => "failed to initialize capture library",
    ZKFP_ERR_NO_DEVICE => "no device connected",
    -4 => "not supported",
    -5 => "invalid parameter",
    ZKFP_ERR_OPEN => "failed to open device",
    -7 => "invalid handle",
    ZKFP_ERR_CAPTURE => "capture failed",
    -9 => "extract fingerprint failed",
    ZKFP_ERR_BUSY => "device busy capturing",
    -20 => "fingerprint verify failed",
    ZKFP_ERR_MERGE => "merge registration templates failed",
    -23 => "device not opened",
    -24 => "not initialized",
    -25 => "device already opened",
    -28 => "timeout",
    _ => "sdk error",
  }
}

/// Waiting for a finger / in progress — keep polling.
pub fn is_transient_capture_code(code: i32) -> bool {
  matches!(code, ZKFP_ERR_BUSY | ZKFP_ERR_CAPTURE)
}
