export function HawalaDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading hawala">
      <div className="space-y-3">
        <div className="bg-muted h-7 w-36 animate-pulse rounded-md" />
        <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-28 animate-pulse rounded-md" />
      </div>

      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="ring-foreground/10 space-y-4 rounded-xl p-6 ring-1"
        >
          <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
          <div className="space-y-3">
            {Array.from({ length: 4 }, (__, row) => (
              <div
                key={row}
                className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4"
              >
                <div className="bg-muted h-4 w-24 animate-pulse rounded-md" />
                <div className="bg-muted h-4 w-full max-w-xs animate-pulse rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
