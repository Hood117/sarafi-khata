"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { primaryNav, secondaryNav } from "@/components/layout/nav-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
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

export function AppSidebar() {
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
          {primaryNav.map((item) => (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
            />
          ))}
        </nav>

        <nav
          aria-label="Secondary"
          className="border-sidebar-border mt-4 flex flex-col items-center gap-2 border-t pt-4"
        >
          {secondaryNav.map((item) => (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
            />
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
