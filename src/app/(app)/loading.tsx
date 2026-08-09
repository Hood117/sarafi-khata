/**
 * Generic content placeholder shown while an (app) route segment loads.
 */
export default function AppSegmentLoading() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
      <div className="bg-muted h-4 w-80 max-w-full animate-pulse rounded-md" />
      <div className="bg-card space-y-3 rounded-xl p-4 shadow-sm ring-1 ring-foreground/10">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="bg-muted h-10 w-full animate-pulse rounded-md"
          />
        ))}
      </div>
    </div>
  );
}
