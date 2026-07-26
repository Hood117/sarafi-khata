import { History } from "lucide-react";

import { Typography } from "@/design-system/typography";

type CustomerHistoryEmptyStateProps = {
  hasActiveFilters?: boolean;
};

export function CustomerHistoryEmptyState({
  hasActiveFilters = false,
}: CustomerHistoryEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6 sm:py-16"
      role="status"
    >
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <History className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">
          {hasActiveFilters ? "No matching history" : "No history yet"}
        </Typography>
        <Typography variant="muted" className="max-w-sm">
          {hasActiveFilters
            ? "Try adjusting the date range, type, currency, or reference filters."
            : "Deposits, withdrawals, and adjustments for this customer will appear here."}
        </Typography>
      </div>
    </div>
  );
}
