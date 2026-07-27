import {
  ArrowLeftRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  Coins,
  HardDrive,
  LayoutGrid,
  Send,
  Settings,
  Shield,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const primaryNav: AppNavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/cash", label: "Cash", icon: Banknote },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/transfers", label: "Transfers", icon: ArrowRightLeft },
  { href: "/exchange", label: "Exchange", icon: Coins },
  { href: "/hawala", label: "Hawala", icon: Send },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export const secondaryNav: AppNavItem[] = [
  { href: "/audit", label: "Audit Logs", icon: Shield },
  { href: "/backup", label: "Backup & Restore", icon: HardDrive },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
