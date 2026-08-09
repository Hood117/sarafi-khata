"use client";

import { AddExternalMoneyDialog } from "@/features/external-money/components/add-external-money-dialog";
import type {
  ExternalMoneyCashWalletOption,
  ExternalMoneyCurrencyOption,
} from "@/features/external-money/services/get-external-money-page-data";

type ExternalMoneyPageHeaderProps = {
  currencies: ExternalMoneyCurrencyOption[];
  cashWallets: ExternalMoneyCashWalletOption[];
  defaultCashWalletId: string;
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function ExternalMoneyPageHeader({
  currencies,
  cashWallets,
  defaultCashWalletId,
  onSuccess,
  successMessage,
}: ExternalMoneyPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddExternalMoneyDialog
          currencies={currencies}
          cashWallets={cashWallets}
          defaultCashWalletId={defaultCashWalletId}
          onSuccess={onSuccess}
        />
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
