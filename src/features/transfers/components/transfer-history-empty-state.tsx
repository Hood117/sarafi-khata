import { ArrowRightLeft } from "lucide-react";

import { Typography } from "@/design-system/typography";

type TransferHistoryEmptyStateProps = {
  hasSearch?: boolean;
};

export function TransferHistoryEmptyState({
  hasSearch = false,
}: TransferHistoryEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6 sm:py-20"
      role="status"
    >
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <ArrowRightLeft className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          {hasSearch
            ? "No matching transfers"
            : "No customer transfers yet"}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {hasSearch
            ? "Try a different search term, or clear the search to see all transfers."
            : "Create a transfer above to see history appear here."}
        </Typography>
      </div>
    </div>
  );
}
