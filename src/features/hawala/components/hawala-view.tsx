"use client";

import { useEffect, useState } from "react";

import { HawalaFilters } from "@/features/hawala/components/hawala-filters";
import { HawalaPageHeader } from "@/features/hawala/components/hawala-page-header";
import { HawalaTable } from "@/features/hawala/components/hawala-table";
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaListItem,
  HawalaWalletOption,
} from "@/features/hawala/domain/types";

type HawalaViewProps = {
  transfers: HawalaListItem[];
  search: string;
  customers: HawalaCustomerOption[];
  cashWallets: HawalaWalletOption[];
  clearingWallets: HawalaWalletOption[];
  currencies: HawalaCurrencyOption[];
};

export function HawalaView({
  transfers,
  search,
  customers,
  cashWallets,
  clearingWallets,
  currencies,
}: HawalaViewProps) {
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
    <div className="space-y-6">
      <HawalaPageHeader
        customers={customers}
        cashWallets={cashWallets}
        clearingWallets={clearingWallets}
        currencies={currencies}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <HawalaFilters search={search} />
      <HawalaTable transfers={transfers} hasSearch={Boolean(search.trim())} />
    </div>
  );
}
