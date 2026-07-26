import { Send } from "lucide-react";

import { Typography } from "@/design-system/typography";

type HawalaEmptyStateProps = {
  hasSearch?: boolean;
};

export function HawalaEmptyState({ hasSearch = false }: HawalaEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6 sm:py-16"
      role="status"
    >
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Send className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">
          {hasSearch ? "No matching hawala transfers" : "No hawala transfers yet"}
        </Typography>
        <Typography variant="muted" className="max-w-sm">
          {hasSearch
            ? "Try a different search term, or clear the search to see all transfers."
            : "Send or receive a hawala transfer to see records here."}
        </Typography>
      </div>
    </div>
  );
}
