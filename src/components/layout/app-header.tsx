"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { pageTitleKeys } from "@/components/layout/nav-config";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { useT } from "@/lib/i18n";

type AppHeaderProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  user: AuthenticatedUser;
};

function resolvePageTitle(
  pathname: string,
  t: ReturnType<typeof useT>,
): string {
  const exactKey = pageTitleKeys[pathname];
  if (exactKey) {
    return t.pages[exactKey];
  }

  if (pathname.startsWith("/customers/")) {
    return t.pages.customerProfile;
  }
  if (pathname.startsWith("/partner-sarafi/")) {
    return t.pages.partnerProfile;
  }
  if (pathname.startsWith("/transactions/")) {
    return t.pages.transactionDetails;
  }
  if (pathname.startsWith("/hawala/")) {
    return t.pages.hawalaDetails;
  }
  if (pathname.startsWith("/exchange/")) {
    return t.pages.exchangeDetails;
  }
  if (pathname.startsWith("/transfers/")) {
    return t.pages.transferDetails;
  }
  if (pathname.startsWith("/reports/monthly")) {
    return t.pages.monthlyReport;
  }
  if (pathname.startsWith("/reports/transactions")) {
    return t.pages.transactionReport;
  }
  if (pathname.startsWith("/reports/hawala")) {
    return t.pages.hawalaReport;
  }
  if (pathname.startsWith("/reports/exchange")) {
    return t.pages.exchangeReport;
  }
  if (pathname.startsWith("/reports/transfers")) {
    return t.pages.transferReport;
  }
  if (pathname.startsWith("/reports/customer-statement")) {
    return t.pages.customerStatement;
  }

  return t.brand.name;
}

export function AppHeader({
  title,
  description,
  actions,
}: AppHeaderProps) {
  const pathname = usePathname();
  const t = useT();

  // Dashboard owns its own composition — hide the shared page title bar.
  if (pathname === "/") {
    return null;
  }

  const resolvedTitle = title ?? resolvePageTitle(pathname, t);

  return (
    <header className="flex items-start justify-between gap-6 px-1 pt-1 sm:px-2">
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {resolvedTitle}
        </h1>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </header>
  );
}
