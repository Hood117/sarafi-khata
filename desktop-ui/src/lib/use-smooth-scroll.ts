import { useEffect, type RefObject } from "react";

import {
  destroyDeskSmoothScroll,
  ensureDeskSmoothScroll,
  refreshDeskSmoothScroll,
} from "@desktop/lib/smooth-scroll";

/** Keep ScrollTrigger synced to the active native desk scroller. */
export function useSmoothScroll(
  shellRef: RefObject<HTMLElement | null>,
  routeKey: string,
) {
  useEffect(() => {
    const shell = shellRef.current;
    ensureDeskSmoothScroll(shell);

    const onResize = () => refreshDeskSmoothScroll(shellRef.current);
    window.addEventListener("resize", onResize);

    const timer = window.setTimeout(() => {
      refreshDeskSmoothScroll(shellRef.current);
    }, 80);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      destroyDeskSmoothScroll();
    };
  }, [shellRef, routeKey]);
}
