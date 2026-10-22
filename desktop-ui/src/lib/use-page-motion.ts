import { useRef, type RefObject } from "react";

import { gsap, lockMotion, motionOk, unlockMotion, useGSAP } from "@desktop/lib/motion";

const APPEAR =
  ".page-header, .section-card, .stat-card, .cash-balance-card, .card, .dashboard-footer";

function eligible(el: HTMLElement): boolean {
  if (el.dataset.motion === "in") return false;
  if (el.closest(".dash-board")) return false;
  if (el.classList.contains("login-card")) return false;
  if (el.classList.contains("modal-panel")) return false;
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

function slideIn(els: HTMLElement[], withOpacity: boolean) {
  if (!els.length || !motionOk()) return;
  for (const el of els) el.dataset.motion = "in";
  lockMotion(els);
  gsap.fromTo(
    els,
    withOpacity ? { opacity: 0, y: 12 } : { y: 12 },
    {
      ...(withOpacity ? { opacity: 1 } : {}),
      y: 0,
      duration: 0.48,
      stagger: {
        each: 0.04,
        amount: Math.min(0.32, Math.max(0, els.length - 1) * 0.04),
      },
      ease: "power3.out",
      overwrite: "auto",
      clearProps: withOpacity ? "opacity,transform" : "transform",
      onComplete: () => unlockMotion(els),
    },
  );
}

function addedElements(records: MutationRecord[]): HTMLElement[] {
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

/** Soft page fade, plus a rise on cards already on screen and cards that load in later. */
export function usePageMotion(mainRef: RefObject<HTMLElement | null>, routeKey: string) {
  useGSAP(
    (ctx, contextSafe) => {
      void ctx;
      const main = mainRef.current;
      if (!main || !motionOk() || !contextSafe) return;

      gsap.fromTo(
        main,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.32,
          ease: "power2.out",
          overwrite: "auto",
          clearProps: "opacity",
        },
      );

      slideIn(collect(main), false);

      const animateAdded = contextSafe((records: MutationRecord[]) => {
        slideIn(addedElements(records), true);
      });
      const obs = new MutationObserver(animateAdded);
      obs.observe(main, { childList: true, subtree: true });
      return () => {
        obs.disconnect();
        main.style.removeProperty("opacity");
        main.querySelectorAll<HTMLElement>(".is-gsap-in").forEach((el) => {
          el.classList.remove("is-gsap-in");
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
        ".quick-actions-bar, .app-chrome-refresh, .settings-menu",
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
