import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** True when Backspace should delete text / change a form control, not navigate. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const el =
    target instanceof HTMLElement
      ? target
      : target.parentElement instanceof HTMLElement
        ? target.parentElement
        : null;
  if (!el) return false;

  if (el.isContentEditable || el.closest("[contenteditable='true'], [contenteditable='']")) {
    return true;
  }

  const field = el.closest("input, textarea, select");
  if (!field) return false;

  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return true;
  }

  if (field instanceof HTMLInputElement) {
    const type = (field.type || "text").toLowerCase();
    // Non-text controls: Backspace is not “typing”, allow navigate.
    if (
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "image" ||
      type === "range" ||
      type === "color"
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Global Backspace → React Router history back.
 * Skips when focus is in a text field so deletion still works.
 */
export function useBackspaceNavigate() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace") return;
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      navigate(-1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
