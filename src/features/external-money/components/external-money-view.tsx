"use client";

import { useEffect, useState } from "react";

import { ExternalMoneyFilters } from "@/features/external-money/components/external-money-filters";
import { ExternalMoneyPageHeader } from "@/features/external-money/components/external-money-page-header";
import { ExternalMoneyTable } from "@/features/external-money/components/external-money-table";
import type {
  ExternalMoneyArchiveFilter,
  ExternalMoneyListItem,
} from "@/features/external-money/domain/types";
import type {
  ExternalMoneyCashWalletOption,
  ExternalMoneyCurrencyOption,
} from "@/features/external-money/services/get-external-money-page-data";

type ExternalMoneyViewProps = {
  items: ExternalMoneyListItem[];
  search: string;
  archiveFilter: ExternalMoneyArchiveFilter;
  currencies: ExternalMoneyCurrencyOption[];
  cashWallets: ExternalMoneyCashWalletOption[];
  defaultCashWalletId: string;
};

export function ExternalMoneyView({
  items,
  search,
  archiveFilter,
  currencies,
  cashWallets,
  defaultCashWalletId,
}: ExternalMoneyViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasFilters = search.trim().length > 0;

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
      <ExternalMoneyPageHeader
        currencies={currencies}
        cashWallets={cashWallets}
        defaultCashWalletId={defaultCashWalletId}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <ExternalMoneyFilters
        key={`${search}:${archiveFilter}`}
        search={search}
        archiveFilter={archiveFilter}
      />
      <ExternalMoneyTable
        items={items}
        archiveFilter={archiveFilter}
        hasFilters={hasFilters}
        onUpdated={setSuccessMessage}
      />
    </div>
  );
}
