"use client";

import { ReceiveHawalaDialog } from "@/features/hawala/components/receive-hawala-dialog";
import { SendHawalaDialog } from "@/features/hawala/components/send-hawala-dialog";
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaWalletOption,
} from "@/features/hawala/domain/types";

type HawalaPageHeaderProps = {
  customers: HawalaCustomerOption[];
  cashWallets: HawalaWalletOption[];
  clearingWallets: HawalaWalletOption[];
  currencies: HawalaCurrencyOption[];
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function HawalaPageHeader({
  customers,
  cashWallets,
  clearingWallets,
  currencies,
  onSuccess,
  successMessage,
}: HawalaPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReceiveHawalaDialog
          customers={customers}
          cashWallets={cashWallets}
          clearingWallets={clearingWallets}
          currencies={currencies}
          onSuccess={onSuccess}
        />
        <SendHawalaDialog
          customers={customers}
          cashWallets={cashWallets}
          clearingWallets={clearingWallets}
          currencies={currencies}
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
