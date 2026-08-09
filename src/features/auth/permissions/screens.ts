import type { Permission } from "@/features/auth/permissions/types";

/**
 * App screens that can be granted per user (sidebar + route access).
 */
export const APP_SCREENS = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    permission: "dashboard.view",
  },
  {
    id: "cash",
    label: "Cash",
    href: "/cash",
    permission: "dashboard.view",
  },
  {
    id: "external-money",
    label: "External Money",
    href: "/external-money",
    permission: "transactions.manage",
  },
  {
    id: "customers",
    label: "Customers",
    href: "/customers",
    permission: "customers.manage",
  },
  {
    id: "transactions",
    label: "Transactions",
    href: "/transactions",
    permission: "transactions.manage",
  },
  {
    id: "daily-book",
    label: "Daily Book",
    href: "/daily-book",
    permission: "transactions.manage",
  },
  {
    id: "transfers",
    label: "Transfers",
    href: "/transfers",
    permission: "transactions.manage",
  },
  {
    id: "exchange",
    label: "Exchange",
    href: "/exchange",
    permission: "transactions.manage",
  },
  {
    id: "hawala",
    label: "Hawala",
    href: "/hawala",
    permission: "hawala.manage",
  },
  {
    id: "partner-sarafi",
    label: "Partner Sarafis",
    href: "/partner-sarafi",
    permission: "hawala.manage",
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    permission: "reports.view",
  },
  {
    id: "wallets",
    label: "Wallets",
    href: "/wallets",
    permission: "wallets.manage",
  },
  {
    id: "audit",
    label: "Audit Logs",
    href: "/settings?tab=audit",
    permission: "audit.view",
  },
  {
    id: "backup",
    label: "Backup & Restore",
    href: "/settings?tab=backup",
    permission: "backup.manage",
  },
  {
    id: "users",
    label: "Users",
    href: "/settings?tab=users",
    permission: "users.manage",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    permission: "settings.manage",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  href: string;
  permission: Permission;
}>;

export type AppScreenId = (typeof APP_SCREENS)[number]["id"];

const SCREEN_IDS = new Set<string>(APP_SCREENS.map((screen) => screen.id));

export function isAppScreenId(value: string): value is AppScreenId {
  return SCREEN_IDS.has(value);
}

export function parseAllowedScreens(
  value: unknown,
): AppScreenId[] | null {
  if (value == null) {
    return null;
  }

  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const screens = raw.filter(
    (item): item is AppScreenId =>
      typeof item === "string" && isAppScreenId(item),
  );

  return screens;
}

export function screenIdsForPermission(
  permission: Permission,
): AppScreenId[] {
  return APP_SCREENS.filter((screen) => screen.permission === permission).map(
    (screen) => screen.id,
  );
}

export function hrefToScreenId(href: string): AppScreenId | null {
  const exact = APP_SCREENS.find((screen) => screen.href === href);
  if (exact) {
    return exact.id;
  }
  return null;
}
