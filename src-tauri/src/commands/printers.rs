//! Windows printer discovery + plain-text receipt print for the desk SPA.

use serde::Deserialize;

use crate::error::AppError;
use crate::printer::{
  list_printers as enumerate_printers, print_plain_text as gdi_print_plain_text, PrintTextResult,
  PrinterInfo, PrinterListResult,
};

// Re-export type for invoke payload documentation / future callers.
pub type ListedPrinter = PrinterInfo;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintPlainTextInput {
  pub printer_name: String,
  pub text: String,
  /// Discovery heuristic: `thermal` | `a4` | `mixed` | `unknown`.
  pub form_factor: Option<String>,
}

/// List currently installed/available Windows printers (name, status, connection, form factor).
#[tauri::command]
pub fn list_printers() -> Result<PrinterListResult, AppError> {
  enumerate_printers().map_err(AppError::Internal)
}

/// Print plain text to a named Windows printer via GDI. Explicit operator action only.
#[tauri::command]
pub fn print_plain_text(input: PrintPlainTextInput) -> Result<PrintTextResult, AppError> {
  let form = input
    .form_factor
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("unknown");
  gdi_print_plain_text(&input.printer_name, &input.text, form).map_err(AppError::Internal)
}
