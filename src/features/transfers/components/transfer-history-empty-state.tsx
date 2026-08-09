"use client";

import { ArrowRightLeft } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

type TransferHistoryEmptyStateProps = {
  hasSearch?: boolean;
};

export function TransferHistoryEmptyState({
  hasSearch = false,
}: TransferHistoryEmptyStateProps) {
  const t = useT();

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
          {hasSearch ? t.transfers.emptyFiltered : t.transfers.emptyTitle}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {hasSearch ? t.common.noResults : t.transfers.emptyHint}
        </Typography>
      </div>
    </div>
  );
}
