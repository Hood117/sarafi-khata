import { hasPermission } from "@/features/auth/permissions/catalog";
import type { Permission } from "@/features/auth/permissions/types";
import type { Role } from "@/generated/prisma/client";

export type AppNavIcon =
  | "LayoutGrid"
  | "Banknote"
  | "Users"
  | "ArrowLeftRight"
  | "ArrowRightLeft"
  | "Coins"
  | "Send"
  | "BarChart3"
  | "Shield"
  | "HardDrive"
  | "UserCog"
  | "Settings";

export type AppNavItem = {
  href: string;
  label: string;
  icon: AppNavIcon;
  permission: Permission;
};

export const primaryNav: AppNavItem[] = [
  { href: "/", label: "Dashboard", icon: "LayoutGrid", permission: "dashboard.view" },
  { href: "/cash", label: "Cash", icon: "Banknote", permission: "dashboard.view" },
  {
    href: "/customers",
    label: "Customers",
    icon: "Users",
    permission: "customers.manage",
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: "ArrowLeftRight",
    permission: "transactions.manage",
  },
  {
    href: "/transfers",
    label: "Transfers",
    icon: "ArrowRightLeft",
    permission: "transactions.manage",
  },
  {
    href: "/exchange",
    label: "Exchange",
    icon: "Coins",
    permission: "transactions.manage",
  },
  { href: "/hawala", label: "Hawala", icon: "Send", permission: "hawala.manage" },
  {
    href: "/reports",
    label: "Reports",
    icon: "BarChart3",
    permission: "reports.view",
  },
];

export const secondaryNav: AppNavItem[] = [
  {
    href: "/audit",
    label: "Audit Logs",
    icon: "Shield",
    permission: "audit.view",
  },
  {
    href: "/backup",
    label: "Backup & Restore",
    icon: "HardDrive",
    permission: "backup.manage",
  },
  { href: "/users", label: "Users", icon: "UserCog", permission: "users.manage" },
  {
    href: "/settings",
    label: "Settings",
    icon: "Settings",
    permission: "settings.manage",
  },
];

export function filterNavForRole(
  items: readonly AppNavItem[],
  role: Role,
): AppNavItem[] {
  return items.filter((item) => hasPermission(role, item.permission));
}

export const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/cash": "Business Cash Overview",
  "/customers": "Customers",
  "/transactions": "Transactions",
  "/transfers": "Transfers",
  "/exchange": "Exchange",
  "/hawala": "Hawala",
  "/reports": "Reports",
  "/audit": "Audit Logs",
  "/backup": "Backup & Restore",
  "/users": "Users",
  "/settings": "Settings",
  "/settings/currencies": "Currencies",
  "/settings/exchange-rates": "Exchange Rates",
  "/settings/wallets": "Wallets",
};
