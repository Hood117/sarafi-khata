/**
 * Money fields always store English digits only (0-9) and at most one `.`.
 * Pashto/Dari keyboards are converted automatically:
 *   ۱۲۲۳۲   → 12232
 *   ۲۵٬۰۰۰  → 25000
 *   25,000  → 25000
 *   ۱۲٫۵۰   → 12.50
 */

/** Map Eastern digit characters to ASCII 0-9; map Arabic decimal to `.`. */
export function toWesternDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, "."); // Arabic decimal separator
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
    if (ch === "." && !seenDot) {
      out += ".";
      seenDot = true;
    }
    // Drop commas, spaces, Pashto letters, and any other junk.
  }
  return out;
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
  if (el.dataset.westernDigits === "true") return true;
  return false;
}

type TrackedInput = HTMLInputElement & {
  _valueTracker?: { setValue: (value: string) => void };
};

/**
 * Global safety net for amount fields that still use plain <input>.
 * Prefer AmountInput / normalizeAmountInput in onChange for React state.
 */
export function installWesternDigitsGuard(): () => void {
  const onInput = (event: Event) => {
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
  };

  document.addEventListener("input", onInput, true);
  return () => document.removeEventListener("input", onInput, true);
}
