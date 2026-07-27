"use client";

import { useEffect, useState } from "react";

import { ExchangeForm } from "@/features/exchange/components/exchange-form";
import { ExchangeHistoryFilters } from "@/features/exchange/components/exchange-history-filters";
import { ExchangeHistoryTable } from "@/features/exchange/components/exchange-history-table";
import type {
  ExchangeCurrencyOption,
  ExchangeCustomerOption,
  ExchangeHistoryListItem,
  ExchangeRateOption,
  ExchangeWalletOption,
} from "@/features/exchange/domain/types";
import { Typography } from "@/design-system/typography";

type ExchangeViewProps = {
  customers: ExchangeCustomerOption[];
  wallets: ExchangeWalletOption[];
  currencies: ExchangeCurrencyOption[];
  rates: ExchangeRateOption[];
  allowManualRateOverride: boolean;
  exchanges: ExchangeHistoryListItem[];
  search: string;
};

function buildReturnTo(search: string): string {
  const trimmed = search.trim();
  if (!trimmed) {
    return "/exchange";
  }
  const params = new URLSearchParams();
  params.set("q", trimmed);
  return `/exchange?${params.toString()}`;
}

export function ExchangeView({
  customers,
  wallets,
  currencies,
  rates,
  allowManualRateOverride,
  exchanges,
  search,
}: ExchangeViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  return (
    <div className="space-y-2">
      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      <div className="max-w-2xl">
        <ExchangeForm
          customers={customers}
          wallets={wallets}
          currencies={currencies}
          rates={rates}
          allowManualRateOverride={allowManualRateOverride}
          onSuccess={setSuccessMessage}
        />
      </div>

      <section className="space-y-2">
        <div className="space-y-1">
          <Typography variant="h4">Exchange history</Typography>
          <Typography variant="muted">
            Posted currency exchanges with the rate used for each deal.
          </Typography>
        </div>

        <ExchangeHistoryFilters search={search} />
        <ExchangeHistoryTable
          exchanges={exchanges}
          hasSearch={Boolean(search.trim())}
          returnTo={buildReturnTo(search)}
        />
      </section>
    </div>
  );
}
