"use client";

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
import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
  AppNavIcon,
  AppNavItem,
} from "@/components/layout/nav-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navIcons: Record<AppNavIcon, LucideIcon> = {
  LayoutGrid,
  Banknote,
  Users,
  ArrowLeftRight,
  ArrowRightLeft,
  Coins,
  Send,
  BarChart3,
  Shield,
  HardDrive,
  UserCog,
  Settings,
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: AppNavIcon;
  active: boolean;
}) {
  const Icon = navIcons[icon];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex size-11 items-center justify-center rounded-2xl transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
          />
        }
      >
        <Icon className="size-5" />
        {active ? (
          <span className="bg-destructive absolute top-2 right-2 size-1.5 rounded-full" />
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

type AppSidebarProps = {
  primaryItems: AppNavItem[];
  secondaryItems: AppNavItem[];
};

export function AppSidebar({
  primaryItems,
  secondaryItems,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <TooltipProvider>
      <aside className="bg-sidebar text-sidebar-foreground flex h-full w-[88px] shrink-0 flex-col items-center rounded-[28px] px-3 py-5 shadow-sm">
        <div className="bg-sidebar-accent text-sidebar-accent-foreground mb-6 flex size-12 items-center justify-center rounded-full text-sm font-semibold tracking-wide">
          S
        </div>

        <nav
          aria-label="Primary"
          className="flex flex-1 flex-col items-center gap-2"
        >
          {primaryItems.map((item) => (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
            />
          ))}
        </nav>

        {secondaryItems.length > 0 ? (
          <nav
            aria-label="Secondary"
            className="border-sidebar-border mt-4 flex flex-col items-center gap-2 border-t pt-4"
          >
            {secondaryItems.map((item) => (
              <SidebarNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
              />
            ))}
          </nav>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}
