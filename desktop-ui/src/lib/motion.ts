import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { parseSignedAmountNumber, toWesternDigits } from "@desktop/lib/western-digits";

gsap.registerPlugin(useGSAP, ScrollTrigger);
gsap.defaults({ force3D: false });
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, useGSAP, ScrollTrigger };

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

function parseMoneyDisplay(value: string): number {
  const n = parseSignedAmountNumber(value);
  return Number.isFinite(n) ? n : 0;
}

function decimalPlacesOf(value: string): number {
  const raw = toWesternDigits(String(value ?? ""))
    .replace(/,/g, "")
    .replace(/−/g, "-")
    .trim();
  const dot = raw.indexOf(".");
  if (dot < 0) return 0;
  return Math.min(6, raw.length - dot - 1);
}

/** Grouped money text matching ledger balance display (e.g. -1,010,500.5). */
export function formatMoneyDisplay(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "0";
  const negative = n < 0;
  const abs = Math.abs(n);
  if (decimals <= 0) {
    const whole = Math.round(abs).toString();
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return negative ? `-${grouped}` : grouped;
  }
  const fixed = abs.toFixed(decimals);
  const [whole, fracRaw = ""] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracRaw.replace(/0+$/, "");
  const body = frac ? `${grouped}.${frac}` : grouped;
  return negative ? `-${body}` : body;
}

const moneyAnimState = new WeakMap<HTMLElement, { n: number }>();

/**
 * Smooth “typing” count of a currency amount, plus a slight jump/zoom on the chip.
 * Snaps to the server display string when finished so formatting stays exact.
 */
export function animateClosingBalanceChange(opts: {
  chip: HTMLElement | null;
  amountEl: HTMLElement;
  fromDisplay: string;
  toDisplay: string;
}) {
  const live = opts.amountEl.textContent?.trim();
  const from = parseMoneyDisplay(live || opts.fromDisplay);
  const to = parseMoneyDisplay(opts.toDisplay);
  const decimals = Math.max(
    decimalPlacesOf(opts.fromDisplay),
    decimalPlacesOf(opts.toDisplay),
    decimalPlacesOf(live || ""),
  );
  const delta = Math.abs(to - from);
  const duration = Math.min(0.85, 0.42 + Math.min(0.4, Math.log10(delta + 1) * 0.18));

  let proxy = moneyAnimState.get(opts.amountEl);
  if (!proxy) {
    proxy = { n: from };
    moneyAnimState.set(opts.amountEl, proxy);
  } else {
    gsap.killTweensOf(proxy);
    proxy.n = from;
  }

  gsap.to(proxy, {
    n: to,
    duration,
    ease: "power2.out",
    overwrite: "auto",
    onUpdate: () => {
      opts.amountEl.textContent = formatMoneyDisplay(proxy!.n, decimals);
    },
    onComplete: () => {
      opts.amountEl.textContent = opts.toDisplay;
    },
  });

  if (!opts.chip || !motionOk()) return;
  lockMotion([opts.chip]);
  gsap.killTweensOf(opts.chip);
  gsap.fromTo(
    opts.chip,
    { scale: 1, y: 0 },
    {
      keyframes: [
        { scale: 1.08, y: -3, duration: 0.16, ease: "power2.out" },
        { scale: 0.97, y: 1, duration: 0.12, ease: "power1.inOut" },
        { scale: 1, y: 0, duration: 0.16, ease: "power2.out" },
      ],
      overwrite: "auto",
      clearProps: "transform",
      onComplete: () => unlockMotion([opts.chip!]),
    },
  );
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

/** Dashboard charts and section cards. Call from a GSAP context. */
export function animateDashboard(root: HTMLElement) {
  if (!motionOk()) return;
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const rtl = document.documentElement.getAttribute("dir") === "rtl";

  const strip = q(".dashboard-day-strip");
  const panels = q(
    ".dashboard-chart-panel, .dashboard-stat-card, .dashboard-cash-panel .cash-balance-card",
  );
  const locked = [...strip, ...panels];
  lockMotion(locked);
  const release = () => unlockMotion(locked);

  if (strip.length) {
    gsap.fromTo(
      strip,
      { y: 10 },
      {
        y: 0,
        duration: 0.42,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }
  if (panels.length) {
    gsap.fromTo(
      panels,
      { y: 16 },
      {
        y: 0,
        duration: 0.5,
        stagger: 0.06,
        delay: 0.08,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
        onComplete: release,
      },
    );
  } else {
    release();
  }

  // Integer KPIs only — never count-up currency / ledger amounts.
  for (const el of q(".dashboard-stat-value[data-count], .dashboard-day-item [data-count]")) {
    const value = Number(el.dataset.count);
    if (!Number.isFinite(value)) continue;
    countUp(el, value, el.dataset.suffix ?? "");
  }

  const barFills = q(".dashboard-bar-fill");
  if (barFills.length) {
    gsap.fromTo(
      barFills,
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: "center bottom",
        duration: 0.7,
        stagger: 0.04,
        delay: 0.12,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const donut = root.querySelector<HTMLElement>(".dashboard-donut");
  if (donut) {
    gsap.fromTo(
      donut,
      { scale: 0.86 },
      {
        scale: 1,
        duration: 0.55,
        delay: 0.1,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }

  const legend = q(".dashboard-donut-legend li");
  if (legend.length) {
    gsap.fromTo(
      legend,
      { x: rtl ? -8 : 8 },
      {
        x: 0,
        duration: 0.35,
        stagger: 0.035,
        delay: 0.14,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }
}

/** Subtle ScrollTrigger reveal for page sections (not rows/inputs/amounts). */
export function revealSections(
  els: HTMLElement[],
  scroller?: HTMLElement | string | null,
) {
  if (!els.length || !motionOk()) return;
  lockMotion(els);
  for (const el of els) {
    if (el.dataset.motion === "in") continue;
    el.dataset.motion = "in";
    gsap.fromTo(
      el,
      { y: 14, opacity: 0.001 },
      {
        y: 0,
        opacity: 1,
        duration: 0.45,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "opacity,transform",
        scrollTrigger: {
          trigger: el,
          scroller: scroller || undefined,
          start: "top 92%",
          toggleActions: "play none none none",
          once: true,
        },
        onComplete: () => unlockMotion([el]),
      },
    );
  }
}
