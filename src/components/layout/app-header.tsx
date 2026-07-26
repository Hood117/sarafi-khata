"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { pageTitles } from "@/components/layout/nav-config";
import { UserSessionMenu } from "@/components/layout/user-session-menu";
import { Input } from "@/components/ui/input";
import type { AuthenticatedUser } from "@/features/auth/domain/types";

type AppHeaderProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  user: AuthenticatedUser;
};

export function AppHeader({
  title,
  description,
  actions,
  user,
}: AppHeaderProps) {
  const pathname = usePathname();
  const resolvedTitle =
    title ??
    pageTitles[pathname] ??
    (pathname.startsWith("/customers/")
      ? "Customer Profile"
      : pathname.startsWith("/transactions/")
        ? "Transaction Details"
        : "Saraf");

  return (
    <header className="flex items-start justify-between gap-6 px-2 pt-1">
      <div className="min-w-0 space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {resolvedTitle}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {actions}
        <div className="relative w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search"
            aria-label="Search"
            className="bg-card border-border h-11 rounded-full pr-4 pl-10 shadow-sm"
            readOnly
          />
        </div>
        <UserSessionMenu user={user} />
      </div>
    </header>
  );
}
