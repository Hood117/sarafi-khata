/** Normalize PIN entry: ASCII + Persian/Arabic-Indic digits → 0–9 only (max 6). */
export function normalizePinDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (code >= 0x30 && code <= 0x39) {
      out += ch;
    } else if (code >= 0x660 && code <= 0x669) {
      out += String.fromCodePoint(code - 0x660 + 0x30);
    } else if (code >= 0x6f0 && code <= 0x6f9) {
      out += String.fromCodePoint(code - 0x6f0 + 0x30);
    }
    if (out.length >= 6) break;
  }
  return out;
}

export function isValidPinDigits(pin: string): boolean {
  return /^\d{6}$/.test(normalizePinDigits(pin));
}

/** Shared props for authorization PIN fields (English digits in RTL UI). */
export const PIN_INPUT_PROPS = {
  type: "password" as const,
  inputMode: "numeric" as const,
  autoComplete: "one-time-code" as const,
  pattern: "[0-9]{6}",
  maxLength: 6,
  dir: "ltr" as const,
  lang: "en",
  className: "ltr-text pin-input",
};
