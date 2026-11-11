import { useEffect, useRef } from "react";

import {
  DESK_CUSTOMER_CREATED_EVENT,
  DESK_MOVEMENT_SAVED_EVENT,
  DESK_PARTNER_CREATED_EVENT,
} from "@desktop/lib/desk-events";

/**
 * Soft-refresh the current page when any desk mutation event fires.
 * Prefer this over remounting the route so open modals / balance chips keep state
 * (needed for closing-balance animations).
 *
 * Uses a ref for the callback so a parent re-render (e.g. closing an inline draft)
 * does not tear down the listener and cancel a just-scheduled refresh.
 */
export function useDeskDataRefresh(onRefresh: () => void): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        onRefreshRef.current();
      }, 40);
    };
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, schedule);
    window.addEventListener(DESK_CUSTOMER_CREATED_EVENT, schedule);
    window.addEventListener(DESK_PARTNER_CREATED_EVENT, schedule);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, schedule);
      window.removeEventListener(DESK_CUSTOMER_CREATED_EVENT, schedule);
      window.removeEventListener(DESK_PARTNER_CREATED_EVENT, schedule);
    };
  }, []);
}
