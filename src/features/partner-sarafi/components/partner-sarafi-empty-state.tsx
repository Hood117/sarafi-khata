"use client";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

export function PartnerSarafiEmptyState() {
  const t = useT();

  return (
    <div className="px-6 py-12 text-center">
      <Typography variant="h4" className="font-semibold">
        {t.partner.emptyTitle}
      </Typography>
      <Typography variant="muted" className="mt-2">
        {t.partner.emptyHint}
      </Typography>
    </div>
  );
}
