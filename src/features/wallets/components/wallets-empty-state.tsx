import { Wallet } from "lucide-react";

import { Typography } from "@/design-system/typography";

export function WalletsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Wallet className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">No wallets yet</Typography>
        <Typography variant="muted" className="max-w-sm">
          System and customer wallets will appear here once they are added.
        </Typography>
      </div>
    </div>
  );
}
