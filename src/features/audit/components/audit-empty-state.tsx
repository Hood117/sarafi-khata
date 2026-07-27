import { Shield } from "lucide-react";

import { Typography } from "@/design-system/typography";

type AuditEmptyStateProps = {
  hasFilters?: boolean;
};

export function AuditEmptyState({ hasFilters = false }: AuditEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6 sm:py-20"
      role="status"
    >
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <Shield className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          {hasFilters ? "No matching audit events" : "No audit events yet"}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {hasFilters
            ? "Try different filters, or clear them to see all activity."
            : "System activity will appear here as users sign in and make changes."}
        </Typography>
      </div>
    </div>
  );
}
