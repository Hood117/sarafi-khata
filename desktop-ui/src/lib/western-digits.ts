/**
 * Normalize Arabic-Indic / Extended Arabic-Indic (Pashto/Dari) digits to Western 0-9
 * so amount fields stay ASCII regardless of keyboard language.
 */
export function toWesternDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
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

/**
 * Capture-phase listener: convert Eastern digits to Western before React reads the value.
 * Keeps caret position so Backspace/Delete work from where the user is typing.
 */
export function installWesternDigitsGuard(): () => void {
  const onInput = (event: Event) => {
    const el = event.target;
    if (!isNumericTextInput(el)) return;
    const before = el.value;
    const after = toWesternDigits(before);
    if (after === before) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = after;
    if (start != null && end != null) {
      // Digit mapping is 1:1, so caret stays at the same index.
      try {
        el.setSelectionRange(start, end);
      } catch {
        /* some input types ignore selection */
      }
    }
  };

  document.addEventListener("input", onInput, true);
  return () => document.removeEventListener("input", onInput, true);
}
