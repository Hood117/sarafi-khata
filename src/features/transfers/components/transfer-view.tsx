"use client";

import { useEffect, useState } from "react";

import { Typography } from "@/design-system/typography";
import { TransferHistoryFilters } from "@/features/transfers/components/transfer-history-filters";
import { TransferHistoryTable } from "@/features/transfers/components/transfer-history-table";
import { TransferPageHeader } from "@/features/transfers/components/transfer-page-header";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import { useT } from "@/lib/i18n";

type TransferViewProps = {
  transfers: TransferHistoryListItem[];
  search: string;
  total: number;
  page: number;
  pageSize: number;
  previousHref: string;
  nextHref: string;
  returnTo: string;
};

export function TransferView({
  transfers,
  search,
  total,
  page,
  pageSize,
  previousHref,
  nextHref,
  returnTo,
}: TransferViewProps) {
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
      <TransferPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />

      <section className="space-y-2">
        <div className="space-y-1">
          <Typography variant="h4">{t.transfers.historyTitle}</Typography>
          <Typography variant="muted">{t.transfers.historyHint}</Typography>
        </div>

        <TransferHistoryFilters search={search} />
        <TransferHistoryTable
          transfers={transfers}
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
