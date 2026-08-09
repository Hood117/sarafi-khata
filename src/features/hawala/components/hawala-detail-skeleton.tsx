"use client";

import { useT } from "@/lib/i18n";

export function HawalaDetailSkeleton() {
  const t = useT();

  return (
    <div className="space-y-2" aria-busy="true" aria-label={t.hawala.loadingHawala}>
      <div className="bg-muted h-8 w-40 animate-pulse rounded-lg" />
      <div className="bg-muted h-10 w-64 animate-pulse rounded-lg" />
      <div className="bg-muted h-48 w-full animate-pulse rounded-xl" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-xl" />
    </div>
  );
}
