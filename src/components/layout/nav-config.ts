import {
  hasPermission,
  hasScreenAccess,
} from "@/features/auth/permissions/catalog";
import type { AppScreenId } from "@/features/auth/permissions/screens";
import type { Permission } from "@/features/auth/permissions/types";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { canSeeSettingsNavItem } from "@/features/settings/domain/settings-tabs";
import type { Role } from "@/generated/prisma/client";
import type { Dictionary } from "@/lib/i18n/dictionary";

export type AppNavIcon =
  | "LayoutGrid"
  | "Banknote"
  | "Users"
  | "Receipt"
  | "ArrowRightLeft"
  | "Coins"
  | "Send"
  | "Building2"
  | "BookOpen"
  | "BarChart3"
  | "Wallet"
  | "HandCoins"
  | "Settings";

export type NavLabelKey = keyof Dictionary["nav"];

export type AppNavItem = {
  href: string;
  labelKey: NavLabelKey;
  icon: AppNavIcon;
  screen: AppScreenId;
  permission: Permission;
};

export const primaryNav: AppNavItem[] = [
  {
    href: "/",
    labelKey: "dashboard",
    icon: "LayoutGrid",
    screen: "dashboard",
    permission: "dashboard.view",
  },
  {
    href: "/cash",
    labelKey: "cash",
    icon: "Banknote",
    screen: "cash",
    permission: "dashboard.view",
  },
  {
    href: "/external-money",
    labelKey: "externalMoney",
    icon: "HandCoins",
    screen: "external-money",
    permission: "transactions.manage",
  },
  {
    href: "/customers",
    labelKey: "customers",
    icon: "Users",
    screen: "customers",
    permission: "customers.manage",
  },
  {
    href: "/transfers",
    labelKey: "transfers",
    icon: "ArrowRightLeft",
    screen: "transfers",
    permission: "transactions.manage",
  },
  {
    href: "/exchange",
    labelKey: "exchange",
    icon: "Coins",
    screen: "exchange",
    permission: "transactions.manage",
  },
  {
    href: "/hawala",
    labelKey: "hawala",
    icon: "Send",
    screen: "hawala",
    permission: "hawala.manage",
  },
  {
    href: "/partner-sarafi",
    labelKey: "partnerSarafi",
    icon: "Building2",
    screen: "partner-sarafi",
    permission: "hawala.manage",
  },
  {
    href: "/wallets",
    labelKey: "wallets",
    icon: "Wallet",
    screen: "wallets",
    permission: "wallets.manage",
  },
  {
    href: "/transactions",
    labelKey: "transactions",
    icon: "Receipt",
    screen: "transactions",
    permission: "transactions.manage",
  },
  {
    href: "/daily-book",
    labelKey: "dailyBook",
    icon: "BookOpen",
    screen: "daily-book",
    permission: "transactions.manage",
  },
  {
    href: "/reports",
    labelKey: "reports",
    icon: "BarChart3",
    screen: "reports",
    permission: "reports.view",
  },
];

/** Settings remains the only secondary item; users/audit/backup live under Settings tabs. */
export const secondaryNav: AppNavItem[] = [
  {
    href: "/settings",
    labelKey: "settings",
    icon: "Settings",
    screen: "settings",
    permission: "settings.manage",
  },
];

export function filterNavForRole(
  items: readonly AppNavItem[],
  role: Role,
): AppNavItem[] {
  return items.filter((item) => hasPermission(role, item.permission));
}

export function filterNavForUser(
  items: readonly AppNavItem[],
  user: Pick<AuthenticatedUser, "role" | "allowedScreens">,
): AppNavItem[] {
  return items.filter((item) => {
    if (item.href === "/settings") {
      return canSeeSettingsNavItem(user);
    }
    return hasScreenAccess(user, item.screen);
  });
}

export type PageTitleKey = keyof Dictionary["pages"];

/** Path → dictionary page title key */
export const pageTitleKeys: Record<string, PageTitleKey> = {
  "/": "dashboard",
  "/cash": "cash",
  "/external-money": "externalMoney",
  "/customers": "customers",
  "/transactions": "transactions",
  "/daily-book": "dailyBook",
  "/transfers": "transfers",
  "/exchange": "exchange",
  "/hawala": "hawala",
  "/partner-sarafi": "partnerSarafi",
  "/wallets": "wallets",
  "/settings/partner-sarafi": "partnerSarafi",
  "/reports": "reports",
  "/reports/monthly": "monthlyReport",
  "/reports/transactions": "transactionReport",
  "/reports/hawala": "hawalaReport",
  "/reports/exchange": "exchangeReport",
  "/reports/transfers": "transferReport",
  "/reports/customer-statement": "customerStatement",
  "/audit": "audit",
  "/backup": "backup",
  "/users": "users",
  "/settings": "settings",
  "/settings/currencies": "currencies",
  "/settings/exchange-rates": "exchangeRates",
};

/** @deprecated Prefer pageTitleKeys + dictionary; kept for gradual migration. */
export const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/cash": "Business Cash Overview",
  "/external-money": "External Money",
  "/customers": "Customers",
  "/transactions": "Transactions",
  "/daily-book": "Daily Book",
  "/transfers": "Transfers",
  "/exchange": "Exchange",
  "/hawala": "Hawala",
  "/partner-sarafi": "Partner Sarafis",
  "/wallets": "Wallets",
  "/settings/partner-sarafi": "Partner Sarafis",
  "/reports": "Reports",
  "/reports/monthly": "Monthly Report",
  "/reports/transactions": "Transaction Report",
  "/audit": "Audit Logs",
  "/backup": "Backup & Restore",
  "/users": "Users",
  "/settings": "Settings",
  "/settings/currencies": "Currencies",
  "/settings/exchange-rates": "Exchange Rates",
};
