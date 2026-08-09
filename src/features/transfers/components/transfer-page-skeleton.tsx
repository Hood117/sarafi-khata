import { TransferHistoryTableSkeleton } from "@/features/transfers/components/transfer-history-table-skeleton";

export function TransferPageSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="bg-muted h-8 w-36 animate-pulse rounded-lg" />
      </div>
      <TransferHistoryTableSkeleton />
    </div>
  );
}
