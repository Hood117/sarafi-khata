"use client";

import { useEffect, useState } from "react";

import { TransactionsPageHeader } from "@/features/transactions/components/transactions-page-header";
import { TransactionsTable } from "@/features/transactions/components/transactions-table";
import type { TransactionListItem } from "@/features/transactions/domain/types";

type TransactionsViewProps = {
  transactions: TransactionListItem[];
  total: number;
  page: number;
  pageSize: number;
  previousHref: string;
  nextHref: string;
  returnTo: string;
};

export function TransactionsView({
  transactions,
  total,
  page,
  pageSize,
  previousHref,
  nextHref,
  returnTo,
}: TransactionsViewProps) {
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
      <TransactionsPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <TransactionsTable
        transactions={transactions}
        returnTo={returnTo}
        total={total}
        page={page}
        pageSize={pageSize}
        previousHref={previousHref}
        nextHref={nextHref}
      />
    </div>
  );
}
