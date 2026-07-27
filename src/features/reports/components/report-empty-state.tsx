import { FileSearch } from "lucide-react";

import { Typography } from "@/design-system/typography";

type ReportEmptyStateProps = {
  hasActiveFilters?: boolean;
  title?: string;
  description?: string;
};

export function ReportEmptyState({
  hasActiveFilters = false,
  title,
  description,
}: ReportEmptyStateProps) {
  const resolvedTitle =
    title ??
    (hasActiveFilters ? "No matching results" : "Nothing to report yet");
  const resolvedDescription =
    description ??
    (hasActiveFilters
      ? "Try adjusting the date range, customer, currency, type, or operator filters."
      : "Posted activity for this section will appear here.");

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
      role="status"
    >
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <FileSearch className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">{resolvedTitle}</Typography>
        <Typography variant="muted" className="max-w-sm">
          {resolvedDescription}
        </Typography>
      </div>
    </div>
  );
}
