import { ExchangeHistoryTableSkeleton } from "@/features/exchange/components/exchange-history-table-skeleton";

export function ExchangePageSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="bg-muted h-8 w-36 animate-pulse rounded-lg" />
      </div>
      <ExchangeHistoryTableSkeleton />
    </div>
  );
}
