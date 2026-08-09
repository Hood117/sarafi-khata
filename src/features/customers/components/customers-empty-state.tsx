"use client";

import { Users } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

type CustomersEmptyStateProps = {
  hasFilters?: boolean;
  viewingArchived?: boolean;
};

export function CustomersEmptyState({
  hasFilters = false,
  viewingArchived = false,
}: CustomersEmptyStateProps) {
  const t = useT();

  const title = hasFilters
    ? t.customers.emptyFiltered
    : viewingArchived
      ? t.customers.emptyArchived
      : t.customers.emptyTitle;

  const description = hasFilters
    ? t.common.noResults
    : viewingArchived
      ? t.customers.emptyArchived
      : t.customers.emptyHint;

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:py-20">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <Users className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          {title}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {description}
        </Typography>
      </div>
    </div>
  );
}
