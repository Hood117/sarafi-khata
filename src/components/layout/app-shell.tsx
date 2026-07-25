import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
};

export function AppShell({
  children,
  title,
  description,
  actions,
}: AppShellProps) {
  return (
    <div className="bg-background flex h-screen min-h-[720px] min-w-[1100px] p-4">
      <AppSidebar />

      <div className="ml-4 flex min-w-0 flex-1 flex-col gap-5">
        <AppHeader title={title} description={description} actions={actions} />

        <ScrollArea className="bg-card min-h-0 flex-1 rounded-[28px] shadow-sm">
          <div className="p-6 md:p-8">{children}</div>
        </ScrollArea>
      </div>
    </div>
  );
}
