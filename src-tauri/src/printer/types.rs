use serde::Serialize;

/// One installed Windows printer (or stub empty on non-Windows).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
  /// Spooler display name (stable handle for later print jobs).
  pub name: String,
  /// Human-readable status (e.g. Ready, Offline, Paper jam).
  pub status: String,
  /// Raw Win32 `PRINTER_INFO_2.Status` bitfield.
  pub status_code: u32,
  pub is_default: bool,
  pub is_local: bool,
  pub is_network: bool,
  pub is_shared: bool,
  /// Port string from the spooler (e.g. `USB001`, `WSD-…`, `192.168.1.10`).
  pub port_name: Option<String>,
  pub driver_name: Option<String>,
  pub location: Option<String>,
  pub comment: Option<String>,
  pub share_name: Option<String>,
  pub server_name: Option<String>,
  /// Heuristic from port / attributes: `usb` | `network` | `file` | `local` | `other`.
  pub connection: String,
  /// Heuristic from paper sizes/names: `thermal` | `a4` | `mixed` | `unknown`.
  pub form_factor: String,
  /// Paper form names reported by the driver (when available).
  pub paper_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterListResult {
  pub printers: Vec<PrinterInfo>,
  pub default_printer: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintTextResult {
  pub ok: bool,
  pub message: String,
}
