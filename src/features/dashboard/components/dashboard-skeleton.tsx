"use client";

import { useT } from "@/lib/i18n";
export function DashboardSkeleton() {
  const t = useT();
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label={t.dashboard.loadingDashboard}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="ring-foreground/10 space-y-3 rounded-3xl px-4 py-5 ring-1"
          >
            <div className="bg-muted h-3 w-28 animate-pulse rounded-md" />
            <div className="bg-muted h-8 w-16 animate-pulse rounded-md" />
            <div className="bg-muted h-3 w-20 animate-pulse rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
        <div className="ring-foreground/10 space-y-4 rounded-3xl p-5 ring-1">
          <div className="space-y-2">
            <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-56 animate-pulse rounded-md" />
          </div>
          <div className="bg-muted h-48 w-full animate-pulse rounded-2xl" />
          <div className="bg-muted h-3 w-full animate-pulse rounded-full" />
        </div>

        <div className="ring-foreground/10 space-y-3 rounded-3xl p-4 ring-1">
          <div className="space-y-2">
            <div className="bg-muted h-6 w-32 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-44 animate-pulse rounded-md" />
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="ring-foreground/10 flex items-center gap-3 rounded-xl px-3 py-3 ring-1"
            >
              <div className="bg-muted size-9 animate-pulse rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="bg-muted h-3 w-28 animate-pulse rounded-md" />
                <div className="bg-muted h-3 w-36 animate-pulse rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
