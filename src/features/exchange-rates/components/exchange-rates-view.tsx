"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Typography } from "@/design-system/typography";
import { ExchangeRatesPageHeader } from "@/features/exchange-rates/components/exchange-rates-page-header";
import { ExchangeRatesTable } from "@/features/exchange-rates/components/exchange-rates-table";
import type {
  ExchangeRateCurrencyOption,
  ExchangeRateListItem,
} from "@/features/exchange-rates/domain/types";

type ExchangeRatesViewProps = {
  rates: ExchangeRateListItem[];
  currencies: ExchangeRateCurrencyOption[];
};

export function ExchangeRatesView({
  rates,
  currencies,
}: ExchangeRatesViewProps) {
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
      <nav aria-label="Breadcrumb">
        <Typography variant="muted" as="p">
          <Link
            href="/settings"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Settings
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">Exchange Rates</span>
        </Typography>
      </nav>

      <ExchangeRatesPageHeader
        currencies={currencies}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <ExchangeRatesTable
        rates={rates}
        currencies={currencies}
        onRateChanged={setSuccessMessage}
      />
    </div>
  );
}
