/**
 * Desk action ids for centralized keyboard shortcuts (Stage 2).
 * Prefer clicking existing UI marked with `data-desk-action`; never duplicate ledger logic here.
 */
export type DeskAction = "new" | "save" | "ok" | "undo" | "print" | "delete" | "refresh";

const ACTION_ATTR = "data-desk-action";

type DeskActionHandler = () => void;

/** LIFO stacks so nested modals / route handlers override page-level ones. */
const handlerStacks = new Map<DeskAction, DeskActionHandler[]>();

export function registerDeskAction(
  action: DeskAction,
  handler: DeskActionHandler,
): () => void {
  const stack = handlerStacks.get(action) ?? [];
  stack.push(handler);
  handlerStacks.set(action, stack);
  return () => {
    const current = handlerStacks.get(action);
    if (!current) return;
    const idx = current.lastIndexOf(handler);
    if (idx >= 0) current.splice(idx, 1);
    if (current.length === 0) handlerStacks.delete(action);
  };
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return true;
  return false;
}

export function isShortcutTypingTarget(target: EventTarget | null): boolean {
  return isEditableTarget(target);
}

function inOpenModal(el: Element): boolean {
  return Boolean(el.closest(".modal-panel, [role='dialog'], .modal-root"));
}

function rowContainsFocus(el: Element): boolean {
  const row = el.closest("tr, [data-desk-row]");
  if (!row) return false;
  const active = document.activeElement;
  return Boolean(active && row.contains(active));
}

function scoreCandidate(el: Element, action: DeskAction): number {
  let score = 0;
  if (inOpenModal(el)) score += 100;
  if (el.hasAttribute("data-desk-primary")) score += 40;
  if (action === "delete" || action === "print") {
    if (el.closest("tbody")) {
      // Row actions only when that row has focus.
      if (!rowContainsFocus(el)) return -1;
      score += 10;
    }
  } else if (el.closest("tbody") && !el.hasAttribute("data-desk-primary")) {
    score -= 20;
  }
  return score;
}

function queryActionButtons(action: DeskAction): HTMLElement[] {
  const nodes = document.querySelectorAll(`[${ACTION_ATTR}="${action}"]`);
  const scored: Array<{ el: HTMLElement; score: number }> = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
    const score = scoreCandidate(node, action);
    if (score < 0) continue;
    scored.push({ el: node, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.el);
}

function clickElement(el: HTMLElement): boolean {
  if (!isVisible(el)) return false;
  el.click();
  return true;
}

function tryRequestSubmitActiveForm(): boolean {
  const active = document.activeElement;
  const formFromFocus =
    active instanceof HTMLElement ? active.closest("form") : null;
  const modalForm = document.querySelector<HTMLFormElement>(
    ".modal-panel form:not([data-desk-ignore]), [role='dialog'] form:not([data-desk-ignore])",
  );
  const form = formFromFocus ?? modalForm;
  if (!form) return false;
  if (form.matches("[data-desk-ignore]")) return false;
  // Prefer an explicit save control inside the form when present.
  const saveBtn = form.querySelector<HTMLElement>(
    `[${ACTION_ATTR}="save"]:not([disabled])`,
  );
  if (saveBtn && isVisible(saveBtn)) return clickElement(saveBtn);
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return true;
  }
  const submit = form.querySelector<HTMLElement>(
    'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])',
  );
  if (submit && isVisible(submit)) return clickElement(submit);
  return false;
}

function runRegistered(action: DeskAction): boolean {
  const stack = handlerStacks.get(action);
  if (!stack || stack.length === 0) return false;
  stack[stack.length - 1]?.();
  return true;
}

/**
 * Trigger an existing desk action via marked buttons or registered handlers.
 * Does not call Tauri/ledger APIs directly.
 */
export function triggerDeskAction(action: DeskAction): boolean {
  const buttons = queryActionButtons(action);
  if (buttons.length > 0) {
    return clickElement(buttons[0]!);
  }

  if (action === "save" && tryRequestSubmitActiveForm()) {
    return true;
  }

  return runRegistered(action);
}
