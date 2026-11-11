/**
 * Money fields always store English digits only (0-9) and at most one `.`.
 * Digits from any common keyboard / script are converted automatically:
 *   ۱۲۲۳۲   → 12232   (Persian / Pashto)
 *   ١٢٢٣٢   → 12232   (Arabic-Indic)
 *   ۲۵٬۰۰۰  → 25000
 *   25,000  → 25000
 *   ۱۲٫۵۰   → 12.50
 *   １２３    → 123    (fullwidth)
 */

/** Map non-Latin digit characters to ASCII 0-9; map Arabic decimals to `.`. */
export function toWesternDigits(value: string): string {
  return value
    // Arabic-Indic digits ٠-٩
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // Extended Arabic-Indic (Persian / Pashto / Urdu) ۰-۹
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Fullwidth ０-９
    .replace(/[\uff10-\uff19]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    // Devanagari ०-९
    .replace(/[\u0966-\u096f]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    // Eastern Arabic decimal separator → .
    .replace(/\u066b/g, ".")
    // Arabic thousands separator / common separators dropped later by normalize
    .replace(/\u066c/g, "");
}

/**
 * Strict amount normalize for inputs + save paths.
 * Keeps only ASCII digits and a single decimal point.
 */
export function normalizeAmountInput(value: string): string {
  const western = toWesternDigits(value);
  let out = "";
  let seenDot = false;
  for (const ch of western) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if ((ch === "." || ch === "٫") && !seenDot) {
      out += ".";
      seenDot = true;
    }
    // Drop commas, spaces, letters, and any other junk.
  }
  return out;
}

/**
 * Parse any user-typed money/rate string (English / Arabic / Pashto digits).
 * Returns NaN when empty or not a finite number.
 */
export function parseAmountNumber(value: string | null | undefined): number {
  const normalized = normalizeAmountInput(String(value ?? ""));
  if (!normalized || normalized === ".") return Number.NaN;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Like parseAmountNumber, but null when not a positive finite amount. */
export function parsePositiveAmount(
  value: string | null | undefined,
): number | null {
  const n = parseAmountNumber(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse display/API money that may be signed (`-`, `−`) and use any digit script.
 * Unlike normalizeAmountInput, the leading minus is preserved.
 */
export function parseSignedAmountNumber(
  value: string | number | null | undefined,
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  const western = toWesternDigits(String(value ?? ""))
    .replace(/,/g, "")
    .replace(/−/g, "-")
    .trim();
  if (!western || western === "-" || western === "." || western === "-.") {
    return Number.NaN;
  }
  const n = Number(western);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** True when `key` is a digit (any supported script) or a decimal separator. */
export function isAmountKeyChar(key: string): boolean {
  if (key.length !== 1) return false;
  if (key === "." || key === "٫" || key === ",") return true;
  const n = normalizeAmountInput(key);
  return n.length === 1 && n >= "0" && n <= "9";
}

export function isNumericTextInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  const type = (el.type || "text").toLowerCase();
  if (type === "number" || type === "tel") return true;
  const mode = (el.inputMode || "").toLowerCase();
  if (mode === "decimal" || mode === "numeric") return true;
  if (el.classList.contains("deposit-amount-input")) return true;
  if (el.classList.contains("fx-simple-amount")) return true;
  if (el.classList.contains("ledger-draft-amount")) return true;
  if (el.classList.contains("ledger-draft-rate")) return true;
  if (el.dataset.westernDigits === "true") return true;
  // Name/id hints for leftover plain money fields.
  const name = `${el.name || ""} ${el.id || ""} ${el.className || ""}`.toLowerCase();
  if (/(amount|rate|qty|quantity|commission|fee|price|salary|balance)/.test(name)) {
    return true;
  }
  return false;
}

type TrackedInput = HTMLInputElement & {
  _valueTracker?: { setValue: (value: string) => void };
};

/**
 * Global safety net for amount fields that still use plain <input>.
 * Prefer AmountInput / normalizeAmountInput in onChange for React state.
 *
 * After converting Eastern digits in the DOM, re-dispatch `input` so React
 * controlled state (and auto-description) still update. Without that, Pashto
 * keyboards can show digits in the field while React amount/note stay empty.
 */
export function installWesternDigitsGuard(): () => void {
  let suppressing = false;
  const onInput = (event: Event) => {
    if (suppressing) return;
    const el = event.target;
    if (!isNumericTextInput(el)) return;

    const before = el.value;
    const after = normalizeAmountInput(before);
    if (after === before) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const tracker = (el as TrackedInput)._valueTracker;
    tracker?.setValue(before);
    el.value = after;

    if (start != null && end != null) {
      const delta = after.length - before.length;
      const nextStart = Math.max(0, Math.min(after.length, start + delta));
      const nextEnd = Math.max(0, Math.min(after.length, end + delta));
      try {
        el.setSelectionRange(nextStart, nextEnd);
      } catch {
        /* ignore */
      }
    }

    // Ensure React onChange / auto-note paths see the Western value.
    suppressing = true;
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    } finally {
      suppressing = false;
    }
  };

  document.addEventListener("input", onInput, true);
  return () => document.removeEventListener("input", onInput, true);
}
