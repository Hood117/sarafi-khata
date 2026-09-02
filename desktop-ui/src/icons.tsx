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

export function IconDebtorsCreditors(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M5 8h7a3 3 0 0 1 0 6H7" />
      <path d="M17 16h-5a3 3 0 0 1 0-6h7" />
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

/** Incoming hawala / receive transfer. */
export function IconReceiveHawala(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 21h14" />
      <circle cx="12" cy="7" r="2.25" opacity="0.35" />
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
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function IconDeposit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Svg>
  );
}

export function IconWithdraw(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M5 3h14" />
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
      <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1 1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <path d="M8 12h8M8 16h6" />
    </Svg>
  );
}

export function IconEmployees(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function IconCalculator(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
    </Svg>
  );
}

/** Native WhatsApp mark: green bubble + white handset. */
export function IconWhatsApp(p: IconProps) {
  return (
    <svg
      className={p.className ?? "nav-icon"}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={p.title ? undefined : true}
      role={p.title ? "img" : undefined}
    >
      {p.title ? <title>{p.title}</title> : null}
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 2.08.62 4.02 1.7 5.66L2 22l4.68-1.77a9.9 9.9 0 0 0 5.36 1.56h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2z"
      />
      <path
        fill="#fff"
        d="M17.47 14.38c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.6-1.5-1.87-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.57.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z"
      />
    </svg>
  );
}

export function IconSave(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-7h8v7" />
    </Svg>
  );
}

export function IconSaveAndNew(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <rect x="3" y="3" width="18" height="18" rx="3" opacity="0.35" />
    </Svg>
  );
}

export function IconPrevious(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 18l-6-6 6-6" />
      <path d="M9 12h11" opacity="0.35" />
    </Svg>
  );
}

export function IconCancel(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function IconOk(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19v-1.2A4.3 4.3 0 0 1 7.8 13.5h2.4A4.3 4.3 0 0 1 14.5 17.8V19" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M21.5 19v-1a3.6 3.6 0 0 0-2.6-3.4" />
    </Svg>
  );
}

export function IconBackup(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </Svg>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M15 12H3" />
      <path d="M6 9l-3 3 3 3" />
    </Svg>
  );
}
