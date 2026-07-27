export function DashboardSkeleton() {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="space-y-2">
        <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-md" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="ring-foreground/10 space-y-3 rounded-xl px-3 py-2 ring-1"
          >
            <div className="bg-muted h-3 w-28 animate-pulse rounded-md" />
            <div className="bg-muted h-8 w-16 animate-pulse rounded-md" />
            <div className="bg-muted h-3 w-20 animate-pulse rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <div className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
          <div className="space-y-2">
            <div className="bg-muted h-6 w-36 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-56 animate-pulse rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="ring-foreground/10 space-y-2 rounded-xl px-3 py-2 ring-1"
              >
                <div className="bg-muted h-3 w-10 animate-pulse rounded-md" />
                <div className="bg-muted h-7 w-24 animate-pulse rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
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

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
          <div className="bg-muted h-4 w-56 animate-pulse rounded-md" />
        </div>
        <div className="ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="bg-muted h-10 w-full animate-pulse rounded-md"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
