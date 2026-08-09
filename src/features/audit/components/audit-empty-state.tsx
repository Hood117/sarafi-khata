"use client";

import { Shield } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

type AuditEmptyStateProps = {
  hasFilters?: boolean;
};

export function AuditEmptyState({ hasFilters = false }: AuditEmptyStateProps) {
  const t = useT();

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
          {hasFilters ? t.audit.emptyFiltered : t.audit.emptyTitle}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {hasFilters ? t.common.noResults : t.audit.emptyHint}
        </Typography>
      </div>
    </div>
  );
}
