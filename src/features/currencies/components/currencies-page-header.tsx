"use client";

import { AddCurrencyDialog } from "@/features/currencies/components/add-currency-dialog";

type CurrenciesPageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function CurrenciesPageHeader({
  onSuccess,
  successMessage,
}: CurrenciesPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddCurrencyDialog onSuccess={onSuccess} />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
