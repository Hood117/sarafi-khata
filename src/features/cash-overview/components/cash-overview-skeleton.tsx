export function CashOverviewSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading business cash overview"
    >
      <div className="space-y-2">
        <div className="bg-muted h-8 w-64 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-md" />
      </div>

      <div className="ring-foreground/10 space-y-5 rounded-xl p-6 ring-1">
        <div className="bg-muted h-6 w-36 animate-pulse rounded-md" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="ring-foreground/10 space-y-2 rounded-xl px-4 py-4 ring-1"
            >
              <div className="bg-muted h-3 w-10 animate-pulse rounded-md" />
              <div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
