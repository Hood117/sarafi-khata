//! GDI plain-text print to a named Windows printer (no vendor SDKs).

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
  CreateDCW, CreateFontW, DeleteDC, DeleteObject, GetDeviceCaps, GetTextMetricsW, SelectObject,
  TextOutW, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_PITCH, DEFAULT_QUALITY, FF_MODERN,
  FW_NORMAL, HGDIOBJ, HORZRES, OUT_TT_PRECIS, TEXTMETRICW, VERTRES,
};
use windows::Win32::Storage::Xps::{DOCINFOW, EndDoc, EndPage, StartDocW, StartPage};

use super::types::PrintTextResult;

/// Print plain text to `printer_name` via the Windows GDI print path.
/// `form_factor` comes from discovery (`thermal` | `a4` | …) and only affects layout.
pub fn print_plain_text(
  printer_name: &str,
  text: &str,
  form_factor: &str,
) -> Result<PrintTextResult, String> {
  let name = printer_name.trim();
  if name.is_empty() {
    return Err("Printer name is required.".into());
  }
  let body = text.trim_end();
  if body.is_empty() {
    return Err("Receipt text is empty.".into());
  }

  let device = wide_null(name);
  let driver = wide_null("WINSPOOL");
  let hdc = unsafe {
    CreateDCW(
      PCWSTR(driver.as_ptr()),
      PCWSTR(device.as_ptr()),
      PCWSTR::null(),
      None,
    )
  };
  if hdc.is_invalid() || hdc.0.is_null() {
    return Err(format!(
      "Could not open printer “{name}”. Check that it is installed and online."
    ));
  }

  let printed = (|| {
    let page_w = unsafe { GetDeviceCaps(Some(hdc), HORZRES) }.max(1);
    let page_h = unsafe { GetDeviceCaps(Some(hdc), VERTRES) }.max(1);

    let thermal = form_factor.eq_ignore_ascii_case("thermal");
    let font_px = if thermal {
      (page_w / 28).clamp(18, 36)
    } else {
      (page_w / 55).clamp(22, 42)
    };
    let margin_x = if thermal {
      (page_w / 20).max(8)
    } else {
      (page_w / 12).max(24)
    };
    let margin_y = if thermal {
      (page_h / 40).max(8)
    } else {
      (page_h / 18).max(36)
    };

    let face = wide_null("Consolas");
    let font = unsafe {
      CreateFontW(
        font_px,
        0,
        0,
        0,
        FW_NORMAL.0 as i32,
        0,
        0,
        0,
        DEFAULT_CHARSET,
        OUT_TT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY,
        u32::from(DEFAULT_PITCH.0) | u32::from(FF_MODERN.0),
        PCWSTR(face.as_ptr()),
      )
    };
    if font.is_invalid() {
      return Err("Could not create receipt font.".into());
    }
    let old_font = unsafe { SelectObject(hdc, HGDIOBJ(font.0)) };

    let mut tm = TEXTMETRICW::default();
    let _ = unsafe { GetTextMetricsW(hdc, &mut tm) };
    let line_h = (tm.tmHeight + tm.tmExternalLeading).max(font_px);
    let max_chars = estimate_chars_per_line(page_w, margin_x, tm.tmAveCharWidth.max(1));

    let doc_name = wide_null("Saraf Hawala Receipt");
    let doc_info = DOCINFOW {
      cbSize: std::mem::size_of::<DOCINFOW>() as i32,
      lpszDocName: PCWSTR(doc_name.as_ptr()),
      lpszOutput: PCWSTR::null(),
      lpszDatatype: PCWSTR::null(),
      fwType: 0,
    };

    let job = unsafe { StartDocW(hdc, &doc_info) };
    if job <= 0 {
      unsafe {
        let _ = SelectObject(hdc, old_font);
        let _ = DeleteObject(HGDIOBJ(font.0));
      }
      return Err(format!("Could not start print job on “{name}”."));
    }

    if unsafe { StartPage(hdc) } <= 0 {
      unsafe {
        let _ = EndDoc(hdc);
        let _ = SelectObject(hdc, old_font);
        let _ = DeleteObject(HGDIOBJ(font.0));
      }
      return Err("Could not start print page.".into());
    }

    let mut y = margin_y;
    let max_y = page_h.saturating_sub(margin_y);
    for raw_line in body.lines() {
      for chunk in wrap_line(raw_line, max_chars) {
        if y + line_h > max_y {
          break;
        }
        let wide: Vec<u16> = chunk.encode_utf16().collect();
        let _ = unsafe { TextOutW(hdc, margin_x, y, &wide) };
        y += line_h;
      }
    }

    let _ = unsafe { EndPage(hdc) };
    let _ = unsafe { EndDoc(hdc) };
    unsafe {
      let _ = SelectObject(hdc, old_font);
      let _ = DeleteObject(HGDIOBJ(font.0));
    }

    // Keep wide buffers alive through GDI calls above.
    let _ = (doc_name, face, driver, device);

    Ok(PrintTextResult {
      ok: true,
      message: format!("Sent receipt to “{name}”."),
    })
  })();

  unsafe {
    let _ = DeleteDC(hdc);
  }
  printed
}

fn estimate_chars_per_line(page_w: i32, margin_x: i32, ave_char: i32) -> usize {
  let usable = (page_w - margin_x * 2).max(ave_char);
  ((usable / ave_char) as usize).clamp(24, 96)
}

fn wrap_line(line: &str, max_chars: usize) -> Vec<String> {
  if line.chars().count() <= max_chars {
    return vec![line.to_string()];
  }
  let mut out = Vec::new();
  let mut current = String::new();
  for ch in line.chars() {
    if current.chars().count() >= max_chars {
      out.push(std::mem::take(&mut current));
    }
    current.push(ch);
  }
  if !current.is_empty() {
    out.push(current);
  }
  if out.is_empty() {
    out.push(String::new());
  }
  out
}

fn wide_null(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}
