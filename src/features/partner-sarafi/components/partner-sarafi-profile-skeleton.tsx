"use client";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

export function PartnerSarafiProfileSkeleton() {
  const t = useT();

  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label={t.partner.loadingPartner}
    >
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="bg-muted h-10 w-72 animate-pulse rounded-md" />
      <div className="bg-card space-y-3 rounded-xl p-4 shadow-sm ring-1 ring-foreground/10">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="bg-muted h-4 w-full max-w-md animate-pulse rounded-md" />
        ))}
      </div>
      <Typography variant="muted" className="sr-only">
        {t.common.loading}
      </Typography>
    </div>
  );
}
