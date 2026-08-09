import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  filterNavForUser,
  primaryNav,
  secondaryNav,
} from "@/components/layout/nav-config";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AuthenticatedUser } from "@/features/auth/domain/types";

type AppShellProps = {
  children: ReactNode;
  user: AuthenticatedUser;
  title?: string;
  description?: string;
  actions?: ReactNode;
};

export function AppShell({
  children,
  user,
  title,
  description,
  actions,
}: AppShellProps) {
  const primaryItems = filterNavForUser(primaryNav, user);
  const secondaryItems = filterNavForUser(secondaryNav, user);

  return (
    <div className="bg-background/40 flex h-dvh max-h-dvh w-full overflow-hidden p-3 sm:p-4 print:block print:h-auto print:max-h-none print:overflow-visible print:p-0">
      <div className="h-full min-h-0 shrink-0 print:hidden">
        <AppSidebar
          primaryItems={primaryItems}
          secondaryItems={secondaryItems}
          user={user}
        />
      </div>

      <div className="ms-3 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:ms-4 print:ms-0 print:block">
        <div className="shrink-0 print:hidden">
          <AppHeader
            title={title}
            description={description}
            actions={actions}
            user={user}
          />
        </div>

        <ScrollArea className="bg-card/95 min-h-0 flex-1 rounded-[28px] shadow-[0_18px_50px_-28px_rgba(24,58,49,0.45)] ring-1 ring-foreground/6 backdrop-blur-[2px] print:overflow-visible print:rounded-none print:shadow-none print:ring-0">
          <div className="animate-in fade-in-0 duration-300 p-4 md:p-5 print:p-0">
            {children}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
