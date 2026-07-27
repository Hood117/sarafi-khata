"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Typography } from "@/design-system/typography";
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
    <div className="space-y-6">
      <nav aria-label="Breadcrumb">
        <Typography variant="muted" as="p">
          <Link
            href="/settings"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Settings
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foreground">Wallets</span>
        </Typography>
      </nav>

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
