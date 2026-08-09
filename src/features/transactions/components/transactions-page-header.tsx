"use client";

import { AddTransactionDialog } from "@/features/transactions/components/add-transaction-dialog";

type TransactionsPageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function TransactionsPageHeader({
  onSuccess,
  successMessage,
}: TransactionsPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddTransactionDialog onSuccess={onSuccess} />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
