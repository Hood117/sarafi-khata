"use client";

import { useEffect, useState } from "react";

import { Typography } from "@/design-system/typography";
import { TransferForm } from "@/features/transfers/components/transfer-form";
import { TransferHistoryFilters } from "@/features/transfers/components/transfer-history-filters";
import { TransferHistoryTable } from "@/features/transfers/components/transfer-history-table";
import type {
  TransferCurrencyOption,
  TransferCustomerOption,
  TransferHistoryListItem,
} from "@/features/transfers/domain/types";

type TransferViewProps = {
  customers: TransferCustomerOption[];
  currencies: TransferCurrencyOption[];
  transfers: TransferHistoryListItem[];
  search: string;
};

function buildReturnTo(search: string): string {
  const trimmed = search.trim();
  if (!trimmed) {
    return "/transfers";
  }
  const params = new URLSearchParams();
  params.set("q", trimmed);
  return `/transfers?${params.toString()}`;
}

export function TransferView({
  customers,
  currencies,
  transfers,
  search,
}: TransferViewProps) {
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
        <TransferForm
          customers={customers}
          currencies={currencies}
          onSuccess={setSuccessMessage}
        />
      </div>

      <section className="space-y-2">
        <div className="space-y-1">
          <Typography variant="h4">Transfer history</Typography>
          <Typography variant="muted">
            Posted customer-to-customer transfers with sender, receiver, and
            amount.
          </Typography>
        </div>

        <TransferHistoryFilters search={search} />
        <TransferHistoryTable
          transfers={transfers}
          hasSearch={Boolean(search.trim())}
          returnTo={buildReturnTo(search)}
        />
      </section>
    </div>
  );
}
