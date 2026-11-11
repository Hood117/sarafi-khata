import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

import {
  isAmountKeyChar,
  normalizeAmountInput,
} from "@desktop/lib/western-digits";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "onChange" | "value"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Physical key → English digit (Pashto/Dari letter layouts on the number row). */
function digitFromCode(code: string): string | null {
  if (code.startsWith("Digit") && code.length === 6) {
    const d = code.slice(5);
    if (d >= "0" && d <= "9") return d;
  }
  if (code.startsWith("Numpad") && code.length === 7) {
    const d = code.slice(6);
    if (d >= "0" && d <= "9") return d;
  }
  return null;
}

/**
 * Money amount field: stores English digits (0-9) and one `.` only.
 *
 * Accepts:
 * - English digits
 * - Arabic / Pashto / other Eastern digits (converted to 0-9)
 * - Physical Digit0–9 keys even when a Pashto letter layout is active
 */
export const AmountInput = forwardRef<HTMLInputElement, Props>(
  function AmountInput(
    { value, onValueChange, className, lang, dir, onKeyDown, ...rest },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    function commit(nextRaw: string, caret?: number) {
      const next = normalizeAmountInput(nextRaw);
      onValueChange(next);
      const pos =
        caret == null ? next.length : Math.max(0, Math.min(next.length, caret));
      requestAnimationFrame(() => {
        try {
          innerRef.current?.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    }

    function insertAtSelection(text: string) {
      const el = innerRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const merged = value.slice(0, start) + text + value.slice(end);
      commit(merged, start + text.length);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // copy/paste/select-all

      // Number-row / numpad physical keys → always Western digits.
      // Handles Pashto layouts where those keys insert letters.
      const fromCode = digitFromCode(e.code);
      if (fromCode != null) {
        e.preventDefault();
        e.stopPropagation();
        insertAtSelection(fromCode);
        return;
      }

      if (
        e.code === "Period" ||
        e.code === "NumpadDecimal" ||
        e.key === "." ||
        e.key === "٫"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (!value.includes(".")) insertAtSelection(".");
        return;
      }

      // Keep editing / navigation keys.
      if (
        e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Tab" ||
        e.key === "Enter" ||
        e.key === "Escape" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        return;
      }

      if (e.key.length === 1) {
        // Arabic / Pashto / other digit characters → convert and insert.
        if (isAmountKeyChar(e.key)) {
          const normalized = normalizeAmountInput(e.key);
          if (!normalized) return;
          if (normalized === "." && value.includes(".")) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          insertAtSelection(normalized);
          return;
        }
        // Block letters and other layout symbols on amount fields.
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      // Fallback for paste / IME / mobile keyboards.
      onValueChange(normalizeAmountInput(e.target.value));
    }

    function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
      e.preventDefault();
      const text = e.clipboardData.getData("text") || "";
      insertAtSelection(text);
    }

    return (
      <input
        {...rest}
        ref={innerRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        lang={lang ?? "en"}
        dir={dir ?? "ltr"}
        className={["deposit-amount-input", className].filter(Boolean).join(" ")}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    );
  },
);
