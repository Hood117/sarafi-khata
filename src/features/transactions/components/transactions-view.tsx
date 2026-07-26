"use client";

import { useEffect, useState } from "react";

import { TransactionsPageHeader } from "@/features/transactions/components/transactions-page-header";
import { TransactionsTable } from "@/features/transactions/components/transactions-table";
import type {
  TransactionCurrencyOption,
  TransactionCustomerOption,
  TransactionListItem,
  TransactionWalletOption,
} from "@/features/transactions/domain/types";

type TransactionsViewProps = {
  transactions: TransactionListItem[];
  customers: TransactionCustomerOption[];
  wallets: TransactionWalletOption[];
  currencies: TransactionCurrencyOption[];
};

export function TransactionsView({
  transactions,
  customers,
  wallets,
  currencies,
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
    <div className="space-y-4">
      <TransactionsPageHeader
        customers={customers}
        wallets={wallets}
        currencies={currencies}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <TransactionsTable transactions={transactions} />
    </div>
  );
}
