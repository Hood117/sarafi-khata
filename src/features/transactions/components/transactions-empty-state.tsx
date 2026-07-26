import { ArrowLeftRight } from "lucide-react";

import { Typography } from "@/design-system/typography";

export function TransactionsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:py-20">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <ArrowLeftRight className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          No transactions yet
        </Typography>
        <Typography variant="muted" className="max-w-md">
          Posted deposits, withdrawals, and adjustments will appear here.
        </Typography>
      </div>
    </div>
  );
}
