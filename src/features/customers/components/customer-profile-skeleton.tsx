"use client";

import { useT } from "@/lib/i18n";
export function CustomerProfileSkeleton() {
  const t = useT();
  return (
    <div className="space-y-2" aria-busy="true" aria-label={t.customers.loadingCustomer}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="bg-muted h-7 w-40 animate-pulse rounded-md" />
          <div className="space-y-2">
            <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-32 animate-pulse rounded-md" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="bg-muted h-8 w-16 animate-pulse rounded-lg" />
          <div className="bg-muted h-8 w-20 animate-pulse rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-muted flex h-8 w-full max-w-md animate-pulse gap-1 rounded-lg p-[3px]">
          <div className="bg-background/60 h-full flex-1 rounded-md" />
          <div className="h-full flex-1 rounded-md" />
          <div className="h-full flex-1 rounded-md" />
        </div>

        <div className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
          <div className="bg-muted h-6 w-48 animate-pulse rounded-md" />
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4"
              >
                <div className="bg-muted h-4 w-24 animate-pulse rounded-md" />
                <div className="bg-muted h-4 w-full max-w-xs animate-pulse rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
