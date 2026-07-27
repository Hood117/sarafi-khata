export function CustomerProfileSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading customer">
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

      <div className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="ring-foreground/10 space-y-2 rounded-xl px-3 py-2 ring-1"
            >
              <div className="bg-muted h-3 w-10 animate-pulse rounded-md" />
              <div className="bg-muted h-7 w-20 animate-pulse rounded-md" />
            </div>
          ))}
        </div>
      </div>

      <div className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
        <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <div className="space-y-4 px-5 py-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex gap-4">
                <div className="bg-muted mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="bg-muted h-3 w-24 animate-pulse rounded-md" />
                  <div className="bg-muted h-4 w-48 animate-pulse rounded-md" />
                  <div className="bg-muted h-3 w-32 animate-pulse rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-muted h-4 w-40 animate-pulse rounded-md" />
          <div className="flex gap-2">
            <div className="bg-muted h-7 w-20 animate-pulse rounded-lg" />
            <div className="bg-muted h-7 w-14 animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
