/**
 * Keyboard-first navigation for desk money / customer forms.
 * Scoped to elements marked with `data-desk-form` — not a global Enter override.
 *
 * Tab / Shift+Tab are intentionally NOT intercepted — the browser's native focus
 * order is used. Enter advances via `listDeskFormFields` only.
 */

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  // Textareas stay in Tab order but are skipped for Enter-advance
  // so final Enter can save without fighting newline behavior.
  "button.hawala-mode:not([disabled])",
  "button[data-desk-choice]:not([disabled])",
].join(",");

export function isElementVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return el.getClientRects().length > 0;
}

function isExcludedField(el: HTMLElement): boolean {
  if (el.closest(".customer-suggest, .currency-suggest")) return true;
  if (el.closest(".modal-actions, .modal-form-footer")) return true;
  if (el.closest(".modal-header")) return true;
  // Readonly auto-description fields are not part of the fill sequence.
  if (el instanceof HTMLInputElement && el.readOnly) return true;
  if (el instanceof HTMLTextAreaElement && el.readOnly) return true;
  return false;
}

/** Visible, interactive fields in logical DOM order inside a desk form. */
export function listDeskFormFields(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(FIELD_SELECTOR);
  return Array.from(nodes).filter(
    (el) => isElementVisible(el) && !isExcludedField(el),
  );
}

export function closestDeskForm(from: Element | null): HTMLElement | null {
  if (!from) return null;
  return (from as HTMLElement).closest?.("[data-desk-form]") as HTMLElement | null;
}

/**
 * Move focus to the next field after `from`.
 * @returns true if focus moved; false if `from` was already the last field.
 */
export function focusNextDeskField(
  root: HTMLElement,
  from: HTMLElement,
): boolean {
  const fields = listDeskFormFields(root);
  if (fields.length === 0) return false;
  let fromIdx = fields.indexOf(from);
  if (fromIdx < 0) {
    fromIdx = fields.findIndex(
      (el) => el === from || el.contains(from) || from.contains(el),
    );
  }
  if (fromIdx < 0) {
    // Not in the Enter sequence — pick the first field after `from` in DOM order.
    fromIdx = fields.findIndex(
      (el) =>
        (from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    );
    if (fromIdx < 0) return false;
    // fromIdx already points at the next field
    const next = fields[fromIdx];
    next.focus();
    selectIfTextInput(next);
    return true;
  }
  const next = fields[fromIdx + 1];
  if (!next) return false;
  next.focus();
  selectIfTextInput(next);
  return true;
}

function selectIfTextInput(el: HTMLElement): void {
  if (
    el instanceof HTMLInputElement &&
    (el.type === "text" ||
      el.type === "search" ||
      el.type === "tel" ||
      el.type === "number" ||
      el.inputMode === "decimal" ||
      el.inputMode === "numeric")
  ) {
    el.select?.();
  }
}

/** Focus the first incomplete required-looking field (best-effort). */
export function focusFirstIncompleteDeskField(root: HTMLElement): void {
  const fields = listDeskFormFields(root);
  for (const el of fields) {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      if (el.required && !String(el.value ?? "").trim()) {
        el.focus();
        return;
      }
    }
    if (
      el instanceof HTMLInputElement &&
      el.closest(".customer-search-wrap") &&
      !String(el.value ?? "").trim()
    ) {
      el.focus();
      return;
    }
  }
  fields[0]?.focus();
}

/** After a combobox picks a value, advance within the nearest desk form. */
export function advanceFromElement(el: Element | null): void {
  const root = closestDeskForm(el);
  if (!root || !(el instanceof HTMLElement)) return;
  focusNextDeskField(root, el);
}

/**
 * Searchable combobox Enter: first Enter selects (list open); second Enter advances.
 * Stops propagation so the desk-form handler does not advance on the same keystroke.
 */
export function handleDeskSearchEnter(
  e: ReactKeyboardEvent<HTMLElement>,
  opts: {
    listOpen: boolean;
    canSelect: boolean;
    select: () => void;
  },
): boolean {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return false;
  e.preventDefault();
  e.stopPropagation();
  if (opts.listOpen && opts.canSelect) {
    opts.select();
    return true;
  }
  if (opts.listOpen) return true;
  advanceFromElement(e.currentTarget);
  return true;
}

/**
 * CurrencyPicker Enter: first Enter picks highlighted match; second Enter advances.
 */
export function handleDeskCurrencyEnter(
  e: ReactKeyboardEvent<HTMLInputElement>,
  opts: {
    open: boolean;
    pickHighlighted: () => boolean;
    onCloseEmpty: () => void;
  },
): boolean {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return false;
  e.preventDefault();
  e.stopPropagation();
  if (opts.open) {
    if (opts.pickHighlighted()) return true;
    opts.onCloseEmpty();
    return true;
  }
  advanceFromElement(e.currentTarget);
  return true;
}

function navigateChoiceGroup(group: HTMLElement, key: string): void {
  const buttons = Array.from(
    group.querySelectorAll<HTMLButtonElement>(
      "button.hawala-mode:not([disabled]), button[data-desk-choice]:not([disabled])",
    ),
  ).filter(isElementVisible);
  if (buttons.length === 0) return;
  const activeIdx = buttons.findIndex(
    (b) =>
      b.classList.contains("active") ||
      b.getAttribute("aria-pressed") === "true" ||
      b === document.activeElement,
  );
  const rtl = document.documentElement.dir === "rtl";
  let goNext = true;
  if (key === "ArrowUp") goNext = false;
  else if (key === "ArrowDown") goNext = true;
  else if (key === "ArrowLeft") goNext = rtl;
  else if (key === "ArrowRight") goNext = !rtl;

  const cur = activeIdx >= 0 ? activeIdx : 0;
  const nextIdx = goNext
    ? (cur + 1) % buttons.length
    : (cur - 1 + buttons.length) % buttons.length;
  const next = buttons[nextIdx];
  next?.focus();
  next?.click();
}

export type DeskFormKeyboardOptions = {
  /** Called when Enter is pressed on the last logical field. Must be the same as Save. */
  onSubmit: () => void;
  busy?: boolean;
};

/**
 * Attach to the desk form root (`data-desk-form`) via `onKeyDown`.
 * Does not steal Enter from textareas or from footer action buttons.
 */
export function handleDeskFormKeyDown(
  e: ReactKeyboardEvent<HTMLElement>,
  options: DeskFormKeyboardOptions,
): void {
  const root = e.currentTarget;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  const group = target.closest<HTMLElement>("[data-desk-choice-group]");
  if (
    group &&
    (e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown") &&
    (target.matches("button.hawala-mode, button[data-desk-choice]") ||
      group.contains(target))
  ) {
    if (target.matches("button.hawala-mode, button[data-desk-choice]")) {
      e.preventDefault();
      navigateChoiceGroup(group, e.key);
    }
    return;
  }

  if (e.key !== "Enter") return;
  if (e.nativeEvent.isComposing) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Textareas keep newline behavior (Shift+Enter also fine).
  if (target.tagName === "TEXTAREA") return;

  // Footer / dialog chrome buttons keep their own activation.
  if (target.closest(".modal-actions, .modal-form-footer, .modal-header")) {
    return;
  }

  // Non-choice buttons (e.g. WhatsApp / Add currency) keep default activation.
  if (
    target.tagName === "BUTTON" &&
    !target.matches("button.hawala-mode, button[data-desk-choice]")
  ) {
    return;
  }

  // CurrencyPicker and open customer suggests handle Enter themselves
  // (select on first Enter, advance on second). Respect their stopPropagation.
  if (e.defaultPrevented) return;

  if (options.busy) {
    e.preventDefault();
    return;
  }

  // Native <select>: Enter typically opens; after selection browser fires change.
  // When closed, Enter advances.
  if (target.tagName === "SELECT") {
    e.preventDefault();
    if (!focusNextDeskField(root, target)) {
      options.onSubmit();
    }
    return;
  }

  // Choice toggles: confirm current choice and move on.
  if (target.matches("button.hawala-mode, button[data-desk-choice]")) {
    e.preventDefault();
    if (!target.classList.contains("active")) {
      target.click();
    }
    if (!focusNextDeskField(root, target)) {
      options.onSubmit();
    }
    return;
  }

  // Currency picker owns Enter (always preventDefault there).
  if (target.matches(".currency-picker-input")) return;

  // Customer/partner search inputs use local Enter handlers (select then advance).
  if (
    target.closest(".customer-search-wrap") &&
    target.tagName === "INPUT"
  ) {
    return;
  }

  // Ordinary inputs / checkboxes
  if (
    target.tagName === "INPUT" ||
    target.tagName === "BUTTON" ||
    target.tagName === "SELECT"
  ) {
    e.preventDefault();
    if (!focusNextDeskField(root, target)) {
      options.onSubmit();
    }
  }
}
