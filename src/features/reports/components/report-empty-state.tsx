"use client";

import { FileSearch } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

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
  const t = useT();

  const resolvedTitle =
    title ??
    (hasActiveFilters ? t.reports.emptyFiltered : t.reports.emptyTitle);
  const resolvedDescription =
    description ??
    (hasActiveFilters ? t.common.noResults : t.reports.emptyHint);

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
