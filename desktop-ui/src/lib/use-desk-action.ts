import { useEffect } from "react";

import { registerDeskAction, type DeskAction } from "@desktop/lib/desk-actions";

/**
 * Register a programmatic desk action for the current page/modal.
 * Prefer `data-desk-action` on existing buttons when possible.
 */
export function useDeskAction(
  action: DeskAction,
  handler: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    return registerDeskAction(action, handler);
  }, [action, handler, enabled]);
}
