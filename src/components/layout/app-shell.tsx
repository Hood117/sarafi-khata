import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
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
  return (
    <div className="bg-background flex h-screen min-h-[720px] min-w-[1100px] p-4 print:block print:h-auto print:min-h-0 print:min-w-0 print:p-0">
      <div className="print:hidden">
        <AppSidebar />
      </div>

      <div className="ml-4 flex min-w-0 flex-1 flex-col gap-5 print:ml-0 print:block">
        <div className="print:hidden">
          <AppHeader
            title={title}
            description={description}
            actions={actions}
            user={user}
          />
        </div>

        <ScrollArea className="bg-card min-h-0 flex-1 rounded-[28px] shadow-md ring-1 ring-foreground/5 print:overflow-visible print:rounded-none print:shadow-none print:ring-0">
          <div className="p-6 md:p-8 print:p-0">{children}</div>
        </ScrollArea>
      </div>
    </div>
  );
}
