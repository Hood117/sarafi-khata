"use client";

import { AddExchangeRateDialog } from "@/features/exchange-rates/components/add-exchange-rate-dialog";
import type { ExchangeRateCurrencyOption } from "@/features/exchange-rates/domain/types";

type ExchangeRatesPageHeaderProps = {
  currencies: ExchangeRateCurrencyOption[];
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function ExchangeRatesPageHeader({
  currencies,
  onSuccess,
  successMessage,
}: ExchangeRatesPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddExchangeRateDialog
          currencies={currencies}
          onSuccess={onSuccess}
        />
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
