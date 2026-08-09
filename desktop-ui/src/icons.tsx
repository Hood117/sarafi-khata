/** Compact inline SVG icons for nav / tabs (no icon package). */

import type { ReactNode } from "react";

type IconProps = { className?: string; title?: string };

function Svg({
  children,
  className,
  title,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ?? "nav-icon"}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconDashboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

export function IconCash(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Svg>
  );
}

export function IconVault(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M8 5V4a4 4 0 0 1 8 0v1" />
      <circle cx="12" cy="13" r="2" />
      <path d="M12 15v2" />
    </Svg>
  );
}

export function IconCustomers(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 21v-2a3.5 3.5 0 0 0-2.5-3.35" />
      <path d="M16.5 3.7a3.5 3.5 0 0 1 0 6.6" />
    </Svg>
  );
}

export function IconTransfers(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 10h13" />
      <path d="M16 6l4 4-4 4" />
      <path d="M17 14H4" />
      <path d="M8 18l-4-4 4-4" />
    </Svg>
  );
}

export function IconExchange(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 8h11" />
      <path d="M14 4l4 4-4 4" />
      <path d="M17 16H6" />
      <path d="M10 20l-4-4 4-4" />
      <circle cx="12" cy="12" r="9" opacity="0.25" />
    </Svg>
  );
}

export function IconHawala(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.9 4.9l2.8 2.8" />
      <path d="M16.3 16.3l2.8 2.8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M2 12h4M18 12h4" />
    </Svg>
  );
}

export function IconPartners(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
    </Svg>
  );
}

export function IconTrading(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 17l5-5 4 3 6-7" />
      <path d="M14 8h4v4" />
    </Svg>
  );
}

export function IconCapital(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M9.5 9.5c.6-1 1.6-1.5 2.5-1.5 1.5 0 2.5.9 2.5 2.2S13.5 12 12 12s-2.5.8-2.5 2.2c0 1.3 1 2.3 2.5 2.3.9 0 1.9-.5 2.5-1.5" />
    </Svg>
  );
}

export function IconDaybook(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </Svg>
  );
}

export function IconReports(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V10" />
      <path d="M12 16V7" />
      <path d="M16 16v-4" />
    </Svg>
  );
}

export function IconTransactions(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  );
}

export function IconRates(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M8 7h6a3 3 0 0 1 0 6H9" />
      <path d="M9 13h5a3 3 0 0 1 0 6H8" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </Svg>
  );
}

export function IconBuy(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconSell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconInventory(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5" />
      <path d="M12 22V12" />
    </Svg>
  );
}

export function IconHistory(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconExpenses(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <path d="M8 12h8M8 16h6" />
    </Svg>
  );
}
