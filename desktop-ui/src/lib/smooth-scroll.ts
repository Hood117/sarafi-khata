import { ScrollTrigger } from "@desktop/lib/motion";

/**
 * Prefer the element that actually overflows. Many desk screens scroll
 * `.app-shell`; customers/daybook/etc. lock the shell and scroll `.app-main`.
 *
 * Native overflow scrolling is used (no Lenis). Custom shell/main scrollers
 * break when Lenis uses the same node as wrapper+content and steals wheel.
 */
export function resolveDeskScroller(root?: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const shell =
    root?.closest<HTMLElement>(".app-shell") ??
    document.querySelector<HTMLElement>(".app-shell");
  const main =
    root?.querySelector?.<HTMLElement>(".app-main") ??
    (root?.classList.contains("app-main") ? root : null) ??
    document.querySelector<HTMLElement>(".app-main");

  const canScroll = (el: HTMLElement | null | undefined) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
      return false;
    }
    return el.scrollHeight > el.clientHeight + 1;
  };

  if (canScroll(main)) return main!;
  if (canScroll(shell)) return shell!;
  if (main && getComputedStyle(main).overflowY !== "hidden") return main;
  return shell;
}

let boundScroller: HTMLElement | null = null;

export function getDeskScroller(): HTMLElement | null {
  return boundScroller ?? resolveDeskScroller();
}

export function destroyDeskSmoothScroll() {
  boundScroller = null;
  ScrollTrigger.defaults({ scroller: undefined });
  ScrollTrigger.refresh();
}

/** Point ScrollTrigger at the active desk scroller (native scroll only). */
export function ensureDeskSmoothScroll(root?: HTMLElement | null): HTMLElement | null {
  const scroller = resolveDeskScroller(root);
  if (!scroller) {
    destroyDeskSmoothScroll();
    return null;
  }

  if (boundScroller !== scroller) {
    boundScroller = scroller;
    ScrollTrigger.defaults({ scroller });
  }
  ScrollTrigger.refresh();
  return scroller;
}

export function refreshDeskSmoothScroll(root?: HTMLElement | null) {
  ensureDeskSmoothScroll(root);
}
