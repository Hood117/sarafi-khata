export function ReportsSkeleton() {
  return (
    <div
      className="space-y-8"
      aria-busy="true"
      aria-label="Loading reports"
    >
      <div className="space-y-2">
        <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-full max-w-lg animate-pulse rounded-md" />
      </div>

      <div className="ring-foreground/10 space-y-4 rounded-xl p-6 ring-1">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-2">
              <div className="bg-muted h-3 w-16 animate-pulse rounded-md" />
              <div className="bg-muted h-8 w-full animate-pulse rounded-md" />
            </div>
          ))}
        </div>
        <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
      </div>

      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="ring-foreground/10 space-y-5 rounded-xl p-6 ring-1"
        >
          <div className="space-y-2">
            <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-64 animate-pulse rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, cardIndex) => (
              <div
                key={cardIndex}
                className="ring-foreground/10 space-y-2 rounded-xl px-4 py-3 ring-1"
              >
                <div className="bg-muted h-3 w-20 animate-pulse rounded-md" />
                <div className="bg-muted h-7 w-12 animate-pulse rounded-md" />
              </div>
            ))}
          </div>
          <div className="bg-muted h-40 w-full animate-pulse rounded-xl" />
        </div>
      ))}
    </div>
  );
}
