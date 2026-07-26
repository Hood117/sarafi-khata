"use client";

import { useEffect, useState } from "react";

import { WalletsPageHeader } from "@/features/wallets/components/wallets-page-header";
import { WalletsTable } from "@/features/wallets/components/wallets-table";
import type {
  WalletCustomerOption,
  WalletListItem,
} from "@/features/wallets/domain/types";

type WalletsViewProps = {
  wallets: WalletListItem[];
  customerOptions: WalletCustomerOption[];
};

export function WalletsView({ wallets, customerOptions }: WalletsViewProps) {
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
      <WalletsPageHeader
        customerOptions={customerOptions}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <WalletsTable
        wallets={wallets}
        customerOptions={customerOptions}
        onWalletChanged={setSuccessMessage}
      />
    </div>
  );
}
