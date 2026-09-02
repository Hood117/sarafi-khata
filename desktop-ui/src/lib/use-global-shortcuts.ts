import { useEffect } from "react";

import {
  isShortcutTypingTarget,
  triggerDeskAction,
  type DeskAction,
} from "@desktop/lib/desk-actions";
import {
  openDeskQuickAction,
  QUICK_ACTION_BY_KEY,
} from "@desktop/lib/desk-quick-actions";
import { navigateDeskTabs } from "@desktop/lib/navigate-desk-tabs";
import { closeTopOverlay, hasOpenOverlay } from "@desktop/lib/overlay-stack";

type GlobalShortcutHandlers = {
  /** Ctrl/Cmd+F — open (or focus) global search. */
  onOpenSearch: () => void;
};

/** Desk form chords that are not quick-action openers. */
const KEY_TO_ACTION: Record<string, DeskAction> = {
  n: "new",
  s: "save",
  o: "ok",
  u: "undo",
  p: "print",
};

/**
 * Centralized app-level keyboard shortcuts.
 * Quick-action openers work on every page (same modals as the Quick Actions bar).
 * Backspace history navigation stays in `useBackspaceNavigate` (unchanged).
 * Esc closes the topmost registered overlay (see `overlay-stack`).
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers) {
  const { onOpenSearch } = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      // Esc → topmost modal / search overlay only
      if (event.key === "Escape") {
        if (closeTopOverlay()) {
          event.preventDefault();
        }
        return;
      }

      // F5 → refresh current screen (never full browser reload in the desk shell)
      if (event.key === "F5") {
        event.preventDefault();
        triggerDeskAction("refresh");
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (event.altKey) return;

      // ← / → → navigate page tabs (not while typing or when an overlay owns focus)
      if (
        !mod &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !isShortcutTypingTarget(event.target) &&
        !hasOpenOverlay()
      ) {
        const rtl = document.documentElement.dir === "rtl";
        const logical: -1 | 1 =
          event.key === "ArrowRight"
            ? rtl
              ? -1
              : 1
            : rtl
              ? 1
              : -1;
        if (navigateDeskTabs(logical, event.target)) {
          event.preventDefault();
        }
        return;
      }

      if (!mod) return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      // Ctrl/Cmd+F → global search (block browser find)
      if (key === "f") {
        event.preventDefault();
        onOpenSearch();
        return;
      }

      const typing = isShortcutTypingTarget(event.target);
      const quickId = QUICK_ACTION_BY_KEY[key];

      // Quick Actions: open modals from any page.
      // Ctrl+C keeps copy while typing in a field; otherwise opens Add Customer.
      if (quickId) {
        if (key === "c" && typing) return;
        event.preventDefault();
        openDeskQuickAction(quickId);
        return;
      }

      const action = KEY_TO_ACTION[key];
      if (!action) return;

      // While typing, only allow form-oriented shortcuts (save / modal OK / new).
      if (typing && action !== "save" && action !== "ok" && action !== "new") {
        return;
      }

      // Always consume desk shortcut chords in the app shell (avoid browser New/Save/Print).
      event.preventDefault();
      triggerDeskAction(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenSearch]);
}
