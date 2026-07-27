import { TransferHistoryTableSkeleton } from "@/features/transfers/components/transfer-history-table-skeleton";

export function TransferPageSkeleton() {
  return (
    <div className="space-y-10">
      <div className="max-w-2xl space-y-8 animate-pulse">
        <div className="space-y-2">
          <div className="bg-muted h-6 w-48 rounded" />
          <div className="bg-muted h-4 w-80 rounded" />
        </div>
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="bg-muted h-8 rounded-lg" />
            <div className="bg-muted h-8 rounded-lg" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="bg-muted h-8 rounded-lg" />
            <div className="bg-muted h-8 rounded-lg" />
          </div>
          <div className="bg-muted h-8 w-full rounded-lg" />
          <div className="bg-muted h-20 w-full rounded-lg" />
        </div>
      </div>

      <TransferHistoryTableSkeleton />
    </div>
  );
}
