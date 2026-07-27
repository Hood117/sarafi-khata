export default function SettingsLoading() {
  return (
    <div
      className="mx-auto max-w-2xl space-y-2"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="bg-muted h-5 w-40 animate-pulse rounded-md" />
          <div className="bg-muted h-4 w-72 max-w-full animate-pulse rounded-md" />
        </div>
        <div className="space-y-4">
          <div className="bg-muted h-8 w-full animate-pulse rounded-lg" />
          <div className="bg-muted h-8 w-full animate-pulse rounded-lg" />
          <div className="bg-muted h-8 w-full animate-pulse rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-muted h-5 w-24 animate-pulse rounded-md" />
        <div className="bg-card space-y-3 rounded-xl p-4 shadow-sm ring-1 ring-foreground/10">
          <div className="flex items-start gap-4">
            <div className="bg-muted size-10 shrink-0 animate-pulse rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="bg-muted h-5 w-32 animate-pulse rounded-md" />
              <div className="bg-muted h-4 w-64 max-w-full animate-pulse rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
