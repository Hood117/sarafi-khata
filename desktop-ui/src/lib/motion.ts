import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);
gsap.defaults({ force3D: false });

export { gsap, useGSAP };

const LOCK = "is-gsap-in";

export function motionOk(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function lockMotion(els: HTMLElement[]) {
  for (const el of els) el.classList.add(LOCK);
}

export function unlockMotion(els: HTMLElement[]) {
  for (const el of els) el.classList.remove(LOCK);
}

export function countUp(el: HTMLElement, value: number, suffix = "") {
  const proxy = { n: 0 };
  el.textContent = `0${suffix}`;
  gsap.to(proxy, {
    n: value,
    duration: 0.55 + Math.min(0.45, Math.abs(value) / 80),
    ease: "power2.out",
    overwrite: "auto",
    onUpdate: () => {
      el.textContent = `${Math.round(proxy.n)}${suffix}`;
    },
  });
}

/** Dialog and search panel: fade the scrim, lift the sheet. */
export function animateOverlayIn(backdrop: HTMLElement, panel: HTMLElement) {
  if (!motionOk()) return;
  lockMotion([backdrop, panel]);
  gsap.set(panel, { transformOrigin: "50% 0%" });
  gsap.fromTo(
    backdrop,
    { opacity: 0 },
    {
      opacity: 1,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto",
      onComplete: () => unlockMotion([backdrop]),
    },
  );
  gsap.fromTo(
    panel,
    { opacity: 0, y: 18, scale: 0.965 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      ease: "power3.out",
      overwrite: "auto",
      clearProps: "transform",
      onComplete: () => unlockMotion([panel]),
    },
  );
}

export function animateOverlayOut(
  backdrop: HTMLElement,
  panel: HTMLElement,
  done: () => void,
) {
  if (!motionOk()) {
    done();
    return;
  }
  lockMotion([backdrop, panel]);
  gsap.killTweensOf([backdrop, panel]);
  gsap.to(panel, {
    opacity: 0,
    y: 10,
    scale: 0.98,
    duration: 0.16,
    ease: "power2.in",
    overwrite: "auto",
  });
  gsap.to(backdrop, {
    opacity: 0,
    duration: 0.18,
    ease: "power2.in",
    overwrite: "auto",
    onComplete: done,
  });
}

/** Login and license shells. Glyph drift is optional. */
export function animateAuthShell(shell: HTMLElement) {
  if (!motionOk()) return;
  const card = shell.querySelector<HTMLElement>(".login-card");
  if (card) {
    lockMotion([card]);
    gsap.fromTo(
      card,
      { opacity: 0, y: 22, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.55,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "opacity,transform",
        onComplete: () => unlockMotion([card]),
      },
    );
  }

  const mark = shell.querySelector<HTMLElement>(".brand-mark");
  if (mark) {
    gsap.fromTo(
      mark,
      { scale: 0.72, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.48,
        delay: 0.08,
        ease: "back.out(1.7)",
        overwrite: "auto",
        clearProps: "opacity,transform",
      },
    );
  }

  shell.querySelectorAll<HTMLElement>(".login-scatter-glyph").forEach((el, index) => {
    const rotate = Number(el.dataset.rotate || 0);
    gsap.set(el, { xPercent: -50, yPercent: -50, rotation: rotate });
    if (index % 3 !== 0) return;
    const distance = 8 + (index % 5) * 3;
    gsap.to(el, {
      y: index % 2 === 0 ? distance : -distance,
      duration: 3.4 + (index % 4) * 0.35,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: (index % 6) * 0.12,
      overwrite: "auto",
    });
  });
}

/** Dashboard charts, counts, and cards. Call from a GSAP context. */
export function animateDashboard(root: HTMLElement) {
  if (!motionOk()) return;
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const rtl = document.documentElement.getAttribute("dir") === "rtl";

  const head = q(".online-dash-head, .dash-board-head");
  const cards = q(".cash-balance-card, .dash-kpi");
  const panels = q(
    ".online-dash-actions-row, .online-dash-activity, .online-dash-section, .dash-panel",
  );
  const locked = [...head, ...cards, ...panels];
  lockMotion(locked);
  const release = () => unlockMotion(locked);

  if (head.length) {
    gsap.fromTo(
      head,
      { y: 8 },
      { y: 0, duration: 0.4, ease: "power2.out", overwrite: "auto", clearProps: "transform" },
    );
  }
  if (cards.length) {
    gsap.fromTo(
      cards,
      { y: 16, scale: 0.98 },
      {
        y: 0,
        scale: 1,
        duration: 0.5,
        stagger: 0.055,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }
  if (panels.length) {
    gsap.fromTo(
      panels,
      { y: 18 },
      {
        y: 0,
        duration: 0.55,
        stagger: 0.08,
        delay: 0.06,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
        onComplete: release,
      },
    );
  } else {
    release();
  }

  for (const el of q("[data-count]")) {
    const value = Number(el.dataset.count);
    if (!Number.isFinite(value)) continue;
    countUp(el, value, el.dataset.suffix ?? "");
  }

  const vFills = q(".dash-vbar-fill");
  if (vFills.length) {
    gsap.fromTo(
      vFills,
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: "center bottom",
        duration: 0.75,
        stagger: 0.05,
        delay: 0.12,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const hFills = q(".dash-bar-fill");
  if (hFills.length) {
    gsap.fromTo(
      hFills,
      { scaleX: 0 },
      {
        scaleX: 1,
        transformOrigin: rtl ? "100% 50%" : "0% 50%",
        duration: 0.8,
        stagger: 0.045,
        delay: 0.15,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const pie = root.querySelector<HTMLElement>(".dash-pie");
  if (pie) {
    gsap.fromTo(
      pie,
      { scale: 0.72 },
      {
        scale: 1,
        duration: 0.7,
        delay: 0.1,
        ease: "back.out(1.5)",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const legend = q(".dash-legend li");
  if (legend.length) {
    gsap.fromTo(
      legend,
      { x: rtl ? -10 : 10 },
      {
        x: 0,
        duration: 0.4,
        stagger: 0.04,
        delay: 0.16,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const stats = q(".dash-customer-stats li");
  if (stats.length) {
    gsap.fromTo(
      stats,
      { y: 10, scale: 0.96 },
      {
        y: 0,
        scale: 1,
        duration: 0.45,
        stagger: 0.06,
        delay: 0.1,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const rates = q(".dash-rates li");
  if (rates.length) {
    gsap.fromTo(
      rates,
      { y: 6 },
      {
        y: 0,
        duration: 0.35,
        stagger: 0.04,
        delay: 0.2,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }
}
