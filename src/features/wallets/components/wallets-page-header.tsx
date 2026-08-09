"use client";

import { AddWalletDialog } from "@/features/wallets/components/add-wallet-dialog";
import type { WalletCustomerOption } from "@/features/wallets/domain/types";

type WalletsPageHeaderProps = {
  customerOptions: WalletCustomerOption[];
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function WalletsPageHeader({
  customerOptions,
  onSuccess,
  successMessage,
}: WalletsPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddWalletDialog
          customerOptions={customerOptions}
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
