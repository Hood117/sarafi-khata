//! Windows printer discovery + plain-text GDI print.
//!
//! Enumerates installed printers via the Win32 spooler API and prints plain text
//! through GDI — no vendor SDKs, no brand/model hardcoding.

mod types;

#[cfg(windows)]
mod win;

#[cfg(windows)]
mod print;

#[cfg(not(windows))]
mod stub;

pub use types::{PrintTextResult, PrinterInfo, PrinterListResult};

#[cfg(windows)]
pub use print::print_plain_text;
#[cfg(windows)]
pub use win::list_printers;

#[cfg(not(windows))]
pub use stub::{list_printers, print_plain_text};
