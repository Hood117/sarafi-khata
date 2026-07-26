import { ArrowLeftRight } from "lucide-react";

import { Typography } from "@/design-system/typography";

export function TransactionsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <ArrowLeftRight className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">No transactions yet</Typography>
        <Typography variant="muted" className="max-w-sm">
          Posted deposits, withdrawals, and adjustments will appear here.
        </Typography>
      </div>
    </div>
  );
}
