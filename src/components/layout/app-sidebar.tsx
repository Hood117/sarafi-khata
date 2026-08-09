"use client";

import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  HandCoins,
  LayoutGrid,
  Receipt,
  Send,
  Settings,
  ArrowRightLeft,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "saraf.sidebar.collapsed";

const navIcons: Record<AppNavIcon, LucideIcon> = {
  LayoutGrid,
  Banknote,
  Users,
  Receipt,
  ArrowRightLeft,
  Coins,
  Send,
  Building2,
  BookOpen,
  BarChart3,
  Wallet,
  HandCoins,
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
  pending,
  collapsed,
}: {
  href: string;
  label: string;
  icon: AppNavIcon;
  active: boolean;
  pending: boolean;
  collapsed: boolean;
}) {
  const Icon = navIcons[icon];
  const highlighted = active || pending;

  const linkClassName = cn(
    "relative flex h-11 items-center rounded-2xl transition-colors",
    collapsed ? "w-11 justify-center" : "w-full gap-3 px-3",
    highlighted
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    pending && !active ? "opacity-80" : null,
  );

  const content = (
    <>
      <Icon className="size-5 shrink-0" />
      {!collapsed ? (
        <span className="truncate text-sm font-medium">{label}</span>
      ) : null}
      {highlighted ? (
        <span
          className={cn(
            "bg-destructive absolute size-1.5 rounded-full",
            collapsed ? "top-2 right-2" : "top-2.5 right-2.5",
          )}
        />
      ) : null}
    </>
  );

  if (!collapsed) {
    return (
      <Link
        href={href}
        prefetch
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={linkClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            prefetch
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={linkClassName}
          />
        }
      >
        {content}
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
  /** Kept for shell compatibility; sign-out lives in Settings. */
  user: AuthenticatedUser;
};

export function AppSidebar({
  primaryItems,
  secondaryItems,
  user: _user,
}: AppSidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") {
        setCollapsed(true);
      }
    } catch {
      // Ignore storage access errors (private mode, etc.).
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage access errors.
      }
      return next;
    });
  }

  function handleNavIntent(href: string) {
    if (!isActivePath(pathname, href)) {
      setPendingHref(href);
    }
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full shrink-0 flex-col rounded-[28px] py-5 shadow-[0_18px_40px_-24px_rgba(15,31,26,0.85)] transition-[width] duration-200 ease-out ring-1 ring-white/5",
          collapsed ? "w-[88px] items-center px-3" : "w-[240px] px-3",
        )}
      >
        <div
          className={cn(
            "mb-4 flex w-full items-center",
            collapsed ? "justify-center" : "gap-3 px-1",
          )}
        >
          <div className="from-sidebar-primary to-accent text-sidebar-primary-foreground flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold tracking-wide shadow-inner">
            ص
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="font-heading truncate text-base font-semibold tracking-wide">
                {t.brand.name}
              </p>
              <p className="text-sidebar-foreground/50 truncate text-xs">
                {t.brand.tagline}
              </p>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "mb-4",
            collapsed ? "flex justify-center" : "w-full",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label={t.shell.expand}
                    aria-expanded={false}
                    className="text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground flex size-11 items-center justify-center rounded-2xl transition-colors"
                  />
                }
              >
                <ChevronsRight className="size-5 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {t.shell.expand}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={t.shell.collapse}
              aria-expanded
              className="text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground flex h-11 w-full items-center gap-3 rounded-2xl px-3 transition-colors"
            >
              <ChevronsLeft className="size-5 shrink-0" />
              <span className="truncate text-sm font-medium">
                {t.shell.collapse}
              </span>
            </button>
          )}
        </div>

        <nav
          aria-label="Primary"
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto sidebar-scroll",
            collapsed ? "items-center" : "items-stretch",
          )}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement | null;
            const anchor = target?.closest("a");
            const href = anchor?.getAttribute("href");
            if (href) {
              handleNavIntent(href);
            }
          }}
        >
          {primaryItems.map((item) => (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={t.nav[item.labelKey]}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
              pending={pendingHref === item.href}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {secondaryItems.length > 0 ? (
          <nav
            aria-label="Secondary"
            className={cn(
              "border-sidebar-border mt-4 flex flex-col gap-2 border-t pt-4",
              collapsed ? "items-center" : "items-stretch",
            )}
            onClickCapture={(event) => {
              const target = event.target as HTMLElement | null;
              const anchor = target?.closest("a");
              const href = anchor?.getAttribute("href");
              if (href) {
                handleNavIntent(href);
              }
            }}
          >
            {secondaryItems.map((item) => (
              <SidebarNavLink
                key={item.href}
                href={item.href}
                label={t.nav[item.labelKey]}
                icon={item.icon}
                active={
                  item.href === "/settings"
                    ? pathname === "/settings" ||
                      pathname.startsWith("/settings/")
                    : isActivePath(pathname, item.href)
                }
                pending={pendingHref === item.href}
                collapsed={collapsed}
              />
            ))}
          </nav>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}
