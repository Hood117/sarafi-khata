import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function CustomerHistorySkeleton() {
  const t = useT();
  return (
    <section
      className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1"
      aria-busy="true"
      aria-label={t.customers.customerHistory}
    >
      <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />

      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <ol className="px-4 py-3 sm:px-5">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="relative flex gap-4">
              <div className="flex w-3 shrink-0 flex-col items-center">
                <span className="bg-muted mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full" />
                {index < 3 ? (
                  <span className="bg-muted mt-1 w-px flex-1 animate-pulse" />
                ) : null}
              </div>
              <div
                className={cn(
                  "min-w-0 flex-1 space-y-2 py-1",
                  index < 3 && "mb-4",
                )}
              >
                <div className="bg-muted h-3 w-24 animate-pulse rounded-md" />
                <div className="bg-muted h-4 w-48 animate-pulse rounded-md" />
                <div className="bg-muted h-3 w-32 animate-pulse rounded-md" />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted h-4 w-40 animate-pulse rounded-md" />
        <div className="flex gap-2">
          <div className="bg-muted h-7 w-20 animate-pulse rounded-lg" />
          <div className="bg-muted h-7 w-14 animate-pulse rounded-lg" />
        </div>
      </div>
    </section>
  );
}
