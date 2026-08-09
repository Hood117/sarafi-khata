"use client";

import { NewExchangeDialog } from "@/features/exchange/components/new-exchange-dialog";

type ExchangePageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function ExchangePageHeader({
  onSuccess,
  successMessage,
}: ExchangePageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <NewExchangeDialog onSuccess={onSuccess} />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success animate-in fade-in-0 slide-in-from-top-1 rounded-xl px-3.5 py-2.5 text-sm font-medium ring-1 ring-success/15 duration-200"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
