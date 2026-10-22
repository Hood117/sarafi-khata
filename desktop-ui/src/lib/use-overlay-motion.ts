import { useCallback, useLayoutEffect, useRef } from "react";

import { animateOverlayIn, animateOverlayOut, gsap } from "@desktop/lib/motion";

/** Enter/exit for a portaled scrim + panel. Result picks can still call `onClose` immediately. */
export function useOverlayMotion(onClose: () => void) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closing = useRef(false);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;
    animateOverlayIn(backdrop, panel);
    return () => {
      gsap.killTweensOf([backdrop, panel]);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) {
      onCloseRef.current();
      return;
    }
    closing.current = true;
    animateOverlayOut(backdrop, panel, () => onCloseRef.current());
  }, []);

  return { backdropRef, panelRef, requestClose };
}
