"use client";

import { Coins } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

export function CurrenciesEmptyState() {
  const t = useT();

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:py-20">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <Coins className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          {t.currencies.emptyTitle}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {t.currencies.emptyHint}
        </Typography>
      </div>
    </div>
  );
}
