"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Typography } from "@/design-system/typography";
import { CurrenciesPageHeader } from "@/features/currencies/components/currencies-page-header";
import { CurrenciesTable } from "@/features/currencies/components/currencies-table";
import type { CurrencyListItem } from "@/features/currencies/domain/types";

type CurrenciesViewProps = {
  currencies: CurrencyListItem[];
};

export function CurrenciesView({ currencies }: CurrenciesViewProps) {
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
          <span className="text-foreground">Currencies</span>
        </Typography>
      </nav>

      <CurrenciesPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <CurrenciesTable
        currencies={currencies}
        onCurrencyChanged={setSuccessMessage}
      />
    </div>
  );
}
