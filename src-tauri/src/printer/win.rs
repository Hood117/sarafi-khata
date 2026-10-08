//! Win32 spooler enumeration (`EnumPrintersW` + `DeviceCapabilitiesW`).

use std::mem;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows::Win32::Graphics::Printing::{
  EnumPrintersW, GetDefaultPrinterW, PRINTER_ATTRIBUTE_LOCAL, PRINTER_ATTRIBUTE_NETWORK,
  PRINTER_ATTRIBUTE_SHARED, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
  PRINTER_STATUS_BUSY, PRINTER_STATUS_DOOR_OPEN, PRINTER_STATUS_ERROR,
  PRINTER_STATUS_INITIALIZING, PRINTER_STATUS_IO_ACTIVE, PRINTER_STATUS_MANUAL_FEED,
  PRINTER_STATUS_NOT_AVAILABLE, PRINTER_STATUS_NO_TONER, PRINTER_STATUS_OFFLINE,
  PRINTER_STATUS_OUT_OF_MEMORY, PRINTER_STATUS_OUTPUT_BIN_FULL, PRINTER_STATUS_PAGE_PUNT,
  PRINTER_STATUS_PAPER_JAM, PRINTER_STATUS_PAPER_OUT, PRINTER_STATUS_PAPER_PROBLEM,
  PRINTER_STATUS_PAUSED, PRINTER_STATUS_PENDING_DELETION, PRINTER_STATUS_POWER_SAVE,
  PRINTER_STATUS_PRINTING, PRINTER_STATUS_PROCESSING, PRINTER_STATUS_SERVER_UNKNOWN,
  PRINTER_STATUS_TONER_LOW, PRINTER_STATUS_USER_INTERVENTION, PRINTER_STATUS_WAITING,
  PRINTER_STATUS_WARMING_UP,
};
use windows::Win32::Storage::Xps::{DeviceCapabilitiesW, DC_PAPERNAMES, DC_PAPERSIZE};

use super::types::{PrinterInfo, PrinterListResult};

pub fn list_printers() -> Result<PrinterListResult, String> {
  let default_printer = default_printer_name();
  let raw = enum_printer_info2()?;
  let printers = raw
    .into_iter()
    .map(|row| {
      let is_default = default_printer
        .as_ref()
        .is_some_and(|d| d.eq_ignore_ascii_case(&row.name));
      let paper_names = paper_form_names(&row.name, row.port_name.as_deref());
      let paper_sizes = paper_sizes_mm10(&row.name, row.port_name.as_deref());
      let form_factor = classify_form_factor(&paper_names, &paper_sizes);
      let connection = classify_connection(
        row.port_name.as_deref(),
        row.is_network,
        row.is_local,
      );
      PrinterInfo {
        name: row.name,
        status: decode_status(row.status_code),
        status_code: row.status_code,
        is_default,
        is_local: row.is_local,
        is_network: row.is_network,
        is_shared: row.is_shared,
        port_name: row.port_name,
        driver_name: row.driver_name,
        location: row.location,
        comment: row.comment,
        share_name: row.share_name,
        server_name: row.server_name,
        connection,
        form_factor,
        paper_names,
      }
    })
    .collect();

  Ok(PrinterListResult {
    printers,
    default_printer,
  })
}

struct RawPrinter {
  name: String,
  status_code: u32,
  is_local: bool,
  is_network: bool,
  is_shared: bool,
  port_name: Option<String>,
  driver_name: Option<String>,
  location: Option<String>,
  comment: Option<String>,
  share_name: Option<String>,
  server_name: Option<String>,
}

fn enum_printer_info2() -> Result<Vec<RawPrinter>, String> {
  let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
  let level = 2u32;

  let mut needed: u32 = 0;
  let mut returned: u32 = 0;
  let first = unsafe {
    EnumPrintersW(
      flags,
      PCWSTR::null(),
      level,
      None,
      &mut needed,
      &mut returned,
    )
  };
  if first.is_ok() {
    return Ok(Vec::new());
  }
  let err = first.err().map(|e| e.code()).unwrap_or_default();
  if err != ERROR_INSUFFICIENT_BUFFER.into() && needed == 0 {
    return Err(format!("EnumPrintersW failed ({err})."));
  }
  if needed == 0 {
    return Ok(Vec::new());
  }

  let mut buffer = vec![0u8; needed as usize];
  let second = unsafe {
    EnumPrintersW(
      flags,
      PCWSTR::null(),
      level,
      Some(buffer.as_mut_slice()),
      &mut needed,
      &mut returned,
    )
  };
  second.map_err(|e| format!("EnumPrintersW failed ({e})."))?;

  let mut out = Vec::with_capacity(returned as usize);
  if returned == 0 {
    return Ok(out);
  }

  let info_size = mem::size_of::<PRINTER_INFO_2W>();
  for i in 0..returned as usize {
    let info = unsafe {
      &*(buffer.as_ptr().add(i * info_size) as *const PRINTER_INFO_2W)
    };
    let name = pwstr_to_string(info.pPrinterName);
    if name.trim().is_empty() {
      continue;
    }
    let attrs = info.Attributes;
    out.push(RawPrinter {
      name,
      status_code: info.Status,
      is_local: attrs & PRINTER_ATTRIBUTE_LOCAL != 0,
      is_network: attrs & PRINTER_ATTRIBUTE_NETWORK != 0,
      is_shared: attrs & PRINTER_ATTRIBUTE_SHARED != 0,
      port_name: nonempty_pwstr(info.pPortName),
      driver_name: nonempty_pwstr(info.pDriverName),
      location: nonempty_pwstr(info.pLocation),
      comment: nonempty_pwstr(info.pComment),
      share_name: nonempty_pwstr(info.pShareName),
      server_name: nonempty_pwstr(info.pServerName),
    });
  }
  Ok(out)
}

fn default_printer_name() -> Option<String> {
  let mut needed: u32 = 0;
  let probe = unsafe { GetDefaultPrinterW(None, &mut needed) };
  if probe.as_bool() || needed == 0 {
    return None;
  }
  let mut buf = vec![0u16; needed as usize];
  let ok = unsafe { GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut needed) };
  if !ok.as_bool() {
    return None;
  }
  let name = utf16_nul_to_string(&buf);
  if name.is_empty() {
    None
  } else {
    Some(name)
  }
}

fn paper_form_names(printer: &str, port: Option<&str>) -> Vec<String> {
  let device = wide_null(printer);
  let port_wide = wide_null(port.unwrap_or(""));
  let count = unsafe {
    DeviceCapabilitiesW(
      PCWSTR(device.as_ptr()),
      PCWSTR(port_wide.as_ptr()),
      DC_PAPERNAMES,
      None,
      None,
    )
  };
  if count <= 0 {
    return Vec::new();
  }
  // Each name is 64 WCHARs (Windows DC_PAPERNAMES).
  let mut names = vec![0u16; (count as usize).saturating_mul(64)];
  let filled = unsafe {
    DeviceCapabilitiesW(
      PCWSTR(device.as_ptr()),
      PCWSTR(port_wide.as_ptr()),
      DC_PAPERNAMES,
      Some(PWSTR(names.as_mut_ptr())),
      None,
    )
  };
  if filled <= 0 {
    return Vec::new();
  }
  let mut out = Vec::with_capacity(filled as usize);
  for i in 0..filled as usize {
    let start = i * 64;
    let end = start + 64;
    if end > names.len() {
      break;
    }
    let s = utf16_nul_to_string(&names[start..end]);
    if !s.is_empty() {
      out.push(s);
    }
  }
  out
}

/// Paper sizes in tenths of a millimeter `(width, height)` from `DC_PAPERSIZE`.
fn paper_sizes_mm10(printer: &str, port: Option<&str>) -> Vec<(i32, i32)> {
  let device = wide_null(printer);
  let port_wide = wide_null(port.unwrap_or(""));
  let count = unsafe {
    DeviceCapabilitiesW(
      PCWSTR(device.as_ptr()),
      PCWSTR(port_wide.as_ptr()),
      DC_PAPERSIZE,
      None,
      None,
    )
  };
  if count <= 0 {
    return Vec::new();
  }
  // POINT = two LONGs; Win32 still takes this buffer via the PWSTR slot.
  let mut points = vec![0i32; (count as usize).saturating_mul(2)];
  let filled = unsafe {
    DeviceCapabilitiesW(
      PCWSTR(device.as_ptr()),
      PCWSTR(port_wide.as_ptr()),
      DC_PAPERSIZE,
      Some(PWSTR(points.as_mut_ptr() as *mut u16)),
      None,
    )
  };
  if filled <= 0 {
    return Vec::new();
  }
  let mut out = Vec::with_capacity(filled as usize);
  for i in 0..filled as usize {
    let w = points[i * 2];
    let h = points[i * 2 + 1];
    out.push((w, h));
  }
  out
}

fn classify_connection(port: Option<&str>, is_network: bool, is_local: bool) -> String {
  let port = port.unwrap_or("").to_ascii_uppercase();
  if port.starts_with("USB") || port.contains("USB") {
    return "usb".into();
  }
  if port.starts_with("FILE:") || port == "PORTPROMPT:" {
    return "file".into();
  }
  if is_network
    || port.starts_with("WSD")
    || port.starts_with("IP_")
    || port.starts_with("TCP")
    || port.contains("HTTP")
    || looks_like_ip_port(&port)
  {
    return "network".into();
  }
  if is_local || port.starts_with("LPT") || port.starts_with("COM") {
    return "local".into();
  }
  "other".into()
}

fn looks_like_ip_port(port: &str) -> bool {
  (port.contains('.') && port.chars().any(|c| c.is_ascii_digit())) || port.starts_with("\\\\")
}

fn classify_form_factor(paper_names: &[String], sizes_mm10: &[(i32, i32)]) -> String {
  let name_thermal = paper_names.iter().any(|n| {
    let l = n.to_ascii_lowercase();
    l.contains("80mm")
      || l.contains("58mm")
      || l.contains("thermal")
      || l.contains("receipt")
      || l.contains("ticket")
  });
  let name_a4 = paper_names.iter().any(|n| {
    let l = n.to_ascii_lowercase();
    l == "a4" || l.contains("a4") || l.contains("letter") || l.contains("legal")
  });

  let size_thermal = sizes_mm10.iter().any(|&(w, h)| is_thermal_size(w, h));
  let size_a4 = sizes_mm10.iter().any(|&(w, h)| is_a4_size(w, h));

  let thermal = name_thermal || size_thermal;
  let a4 = name_a4 || size_a4;

  match (thermal, a4) {
    (true, true) => "mixed".into(),
    (true, false) => "thermal".into(),
    (false, true) => "a4".into(),
    (false, false) => "unknown".into(),
  }
}

fn is_a4_size(w: i32, h: i32) -> bool {
  let (a, b) = ordered(w.abs(), h.abs());
  (a >= 2000 && a <= 2200) && (b >= 2800 && b <= 3100)
}

fn is_thermal_size(w: i32, h: i32) -> bool {
  let (a, b) = ordered(w.abs(), h.abs());
  let narrow = a >= 500 && a <= 900;
  let long_roll = b >= 1500 || b == 0;
  narrow && (long_roll || b <= 1200)
}

fn ordered(a: i32, b: i32) -> (i32, i32) {
  if a <= b {
    (a, b)
  } else {
    (b, a)
  }
}

fn decode_status(status: u32) -> String {
  if status == 0 {
    return "Ready".into();
  }
  let mut parts: Vec<&str> = Vec::new();
  let flags: &[(u32, &str)] = &[
    (PRINTER_STATUS_PAUSED, "Paused"),
    (PRINTER_STATUS_ERROR, "Error"),
    (PRINTER_STATUS_PENDING_DELETION, "Pending deletion"),
    (PRINTER_STATUS_PAPER_JAM, "Paper jam"),
    (PRINTER_STATUS_PAPER_OUT, "Paper out"),
    (PRINTER_STATUS_MANUAL_FEED, "Manual feed"),
    (PRINTER_STATUS_PAPER_PROBLEM, "Paper problem"),
    (PRINTER_STATUS_OFFLINE, "Offline"),
    (PRINTER_STATUS_IO_ACTIVE, "I/O active"),
    (PRINTER_STATUS_BUSY, "Busy"),
    (PRINTER_STATUS_PRINTING, "Printing"),
    (PRINTER_STATUS_OUTPUT_BIN_FULL, "Output bin full"),
    (PRINTER_STATUS_NOT_AVAILABLE, "Not available"),
    (PRINTER_STATUS_WAITING, "Waiting"),
    (PRINTER_STATUS_PROCESSING, "Processing"),
    (PRINTER_STATUS_INITIALIZING, "Initializing"),
    (PRINTER_STATUS_WARMING_UP, "Warming up"),
    (PRINTER_STATUS_TONER_LOW, "Toner low"),
    (PRINTER_STATUS_NO_TONER, "No toner"),
    (PRINTER_STATUS_PAGE_PUNT, "Page punt"),
    (PRINTER_STATUS_USER_INTERVENTION, "User intervention"),
    (PRINTER_STATUS_OUT_OF_MEMORY, "Out of memory"),
    (PRINTER_STATUS_DOOR_OPEN, "Door open"),
    (PRINTER_STATUS_SERVER_UNKNOWN, "Server unknown"),
    (PRINTER_STATUS_POWER_SAVE, "Power save"),
  ];
  for &(bit, label) in flags {
    if status & bit != 0 {
      parts.push(label);
    }
  }
  if parts.is_empty() {
    format!("Status 0x{status:X}")
  } else {
    parts.join(", ")
  }
}

fn pwstr_to_string(ptr: PWSTR) -> String {
  if ptr.is_null() {
    return String::new();
  }
  unsafe { ptr.to_string().unwrap_or_default() }
}

fn nonempty_pwstr(ptr: PWSTR) -> Option<String> {
  let s = pwstr_to_string(ptr);
  let t = s.trim();
  if t.is_empty() {
    None
  } else {
    Some(t.to_string())
  }
}

fn wide_null(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn utf16_nul_to_string(buf: &[u16]) -> String {
  let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
  String::from_utf16_lossy(&buf[..end]).trim().to_string()
}
