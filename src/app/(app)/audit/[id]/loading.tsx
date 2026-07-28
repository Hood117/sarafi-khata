export default function AuditDetailLoading() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading audit event"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="bg-muted h-8 w-44 animate-pulse rounded-md" />
          <div className="bg-muted h-4 w-64 max-w-full animate-pulse rounded-md" />
        </div>
        <div className="bg-muted h-9 w-28 animate-pulse rounded-lg" />
      </div>

      <div className="ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
        <div className="bg-muted h-5 w-40 animate-pulse rounded-md" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="bg-muted h-4 w-24 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-full max-w-sm animate-pulse rounded-md" />
          </div>
        ))}
      </div>

      <div className="ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
        <div className="bg-muted h-5 w-36 animate-pulse rounded-md" />
        <div className="bg-muted h-40 w-full animate-pulse rounded-xl" />
      </div>
    </div>
  );
}
