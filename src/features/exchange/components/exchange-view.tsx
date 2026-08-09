"use client";

import { useEffect, useState } from "react";

import { ExchangeHistoryFilters } from "@/features/exchange/components/exchange-history-filters";
import { ExchangeHistoryTable } from "@/features/exchange/components/exchange-history-table";
import { ExchangePageHeader } from "@/features/exchange/components/exchange-page-header";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

type ExchangeViewProps = {
  exchanges: ExchangeHistoryListItem[];
  search: string;
  total: number;
  page: number;
  pageSize: number;
  previousHref: string;
  nextHref: string;
  returnTo: string;
};

export function ExchangeView({
  exchanges,
  search,
  total,
  page,
  pageSize,
  previousHref,
  nextHref,
  returnTo,
}: ExchangeViewProps) {
  const t = useT();
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
      <ExchangePageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />

      <section className="space-y-2">
        <div className="space-y-1">
          <Typography variant="h4">{t.exchange.historyTitle}</Typography>
          <Typography variant="muted">{t.exchange.historyHint}</Typography>
        </div>

        <ExchangeHistoryFilters search={search} />
        <ExchangeHistoryTable
          exchanges={exchanges}
          hasSearch={Boolean(search.trim())}
          returnTo={returnTo}
          total={total}
          page={page}
          pageSize={pageSize}
          previousHref={previousHref}
          nextHref={nextHref}
        />
      </section>
    </div>
  );
}
