use super::types::{PrintTextResult, PrinterListResult};

/// Non-Windows: no spooler — return an empty list (not an error).
pub fn list_printers() -> Result<PrinterListResult, String> {
  Ok(PrinterListResult {
    printers: Vec::new(),
    default_printer: None,
  })
}

pub fn print_plain_text(
  _printer_name: &str,
  _text: &str,
  _form_factor: &str,
) -> Result<PrintTextResult, String> {
  Err("Printing is only available on Windows.".into())
}
