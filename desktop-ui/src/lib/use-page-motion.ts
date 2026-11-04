import { useRef, type RefObject } from "react";

import {
  gsap,
  lockMotion,
  motionOk,
  revealSections,
  ScrollTrigger,
  unlockMotion,
  useGSAP,
} from "@desktop/lib/motion";
import {
  getDeskScroller,
  refreshDeskSmoothScroll,
} from "@desktop/lib/smooth-scroll";

const APPEAR =
  ".page-header, .section-card, .records-panel, .stat-card, .cash-balance-card, .card, .dashboard-footer, .stat-grid, .hawala-kpi-strip, .customer-detail-panel, .report-panel";

function eligible(el: HTMLElement): boolean {
  if (el.dataset.motion === "in") return false;
  if (el.closest(".dashboard-home")) return false;
  if (el.closest(".dash-board")) return false;
  if (el.classList.contains("login-card")) return false;
  if (el.classList.contains("modal-panel")) return false;
  if (el.closest("table, tbody, thead, tr, td, th, input, textarea, select")) {
    return false;
  }
  return true;
}

function outermost(els: HTMLElement[]): HTMLElement[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
}

function collect(root: ParentNode): HTMLElement[] {
  return outermost(
    Array.from(root.querySelectorAll<HTMLElement>(APPEAR)).filter(eligible),
  );
}

function addedSections(records: MutationRecord[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches(APPEAR)) found.push(node);
      node.querySelectorAll<HTMLElement>(APPEAR).forEach((el) => found.push(el));
    }
  }
  return outermost(found.filter(eligible));
}

/** Soft page fade + ScrollTrigger section reveals on the native desk scroller. */
export function usePageMotion(mainRef: RefObject<HTMLElement | null>, routeKey: string) {
  useGSAP(
    (ctx, contextSafe) => {
      void ctx;
      const main = mainRef.current;
      if (!main || !motionOk() || !contextSafe) return;

      refreshDeskSmoothScroll(main);
      const scroller = getDeskScroller();

      gsap.fromTo(
        main,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
          overwrite: "auto",
          clearProps: "opacity",
        },
      );

      revealSections(collect(main), scroller);

      const onDomChange = contextSafe((records: MutationRecord[]) => {
        const next = addedSections(records);
        if (next.length) revealSections(next, getDeskScroller());
        window.requestAnimationFrame(() => refreshDeskSmoothScroll(mainRef.current));
      });
      const obs = new MutationObserver(onDomChange);
      obs.observe(main, { childList: true, subtree: true });

      return () => {
        obs.disconnect();
        main.style.removeProperty("opacity");
        main.querySelectorAll<HTMLElement>("[data-motion='in']").forEach((el) => {
          delete el.dataset.motion;
        });
        main.querySelectorAll<HTMLElement>(".is-gsap-in").forEach((el) => {
          el.classList.remove("is-gsap-in");
        });
        ScrollTrigger.getAll().forEach((st) => {
          if (main.contains(st.trigger as Node | null)) st.kill();
        });
      };
    },
    { scope: mainRef, dependencies: [routeKey], revertOnUpdate: true },
  );
}

/** One-time entrance for the tab strip and quick actions. */
export function useChromeIntro(linkCount: number) {
  const played = useRef(false);
  useGSAP(
    () => {
      if (played.current || !motionOk() || linkCount === 0) return;
      const tabs = gsap.utils.toArray<HTMLElement>(".app-tabbar-link");
      const chrome = gsap.utils.toArray<HTMLElement>(
        ".quick-actions-bar, .app-chrome-refresh, .settings-menu, .app-header-business",
      );
      if (!tabs.length && !chrome.length) return;
      played.current = true;
      if (tabs.length) {
        lockMotion(tabs);
        gsap.fromTo(
          tabs,
          { opacity: 0, y: -8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.34,
            stagger: 0.028,
            ease: "power2.out",
            overwrite: "auto",
            clearProps: "opacity,transform",
            onComplete: () => unlockMotion(tabs),
          },
        );
      }
      if (chrome.length) {
        lockMotion(chrome);
        gsap.fromTo(
          chrome,
          { opacity: 0, y: -6 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            delay: 0.08,
            stagger: 0.05,
            ease: "power2.out",
            overwrite: "auto",
            clearProps: "opacity,transform",
            onComplete: () => unlockMotion(chrome),
          },
        );
      }
    },
    { dependencies: [linkCount] },
  );
}
