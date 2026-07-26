"use client";

import type { WalletType } from "@/generated/prisma/client";

import { ClickableTableRow } from "@/components/clickable-table-row";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import { ArchiveWalletButton } from "@/features/wallets/components/archive-wallet-button";
import { EditWalletDialog } from "@/features/wallets/components/edit-wallet-dialog";
import { WalletsEmptyState } from "@/features/wallets/components/wallets-empty-state";
import type {
  WalletCustomerOption,
  WalletListItem,
} from "@/features/wallets/domain/types";

type WalletsTableProps = {
  wallets: WalletListItem[];
  customerOptions: WalletCustomerOption[];
  onWalletChanged?: (message: string) => void;
};

const TYPE_LABELS: Record<WalletType, string> = {
  VAULT: "Vault",
  TILL: "Till",
  CUSTOMER: "Customer",
  SYSTEM: "System",
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function walletStatusTone(wallet: WalletListItem) {
  if (wallet.isArchived) {
    return toneForRecordStatus("ARCHIVED");
  }
  return toneForRecordStatus(wallet.isActive ? "ACTIVE" : "INACTIVE");
}

function walletStatusLabel(wallet: WalletListItem) {
  if (wallet.isArchived) {
    return "Archived";
  }
  return wallet.isActive ? "Active" : "Inactive";
}

function WalletActionsCell({
  wallet,
  customerOptions,
  onWalletChanged,
}: {
  wallet: WalletListItem;
  customerOptions: WalletCustomerOption[];
  onWalletChanged?: (message: string) => void;
}) {
  if (wallet.isArchived) {
    return <Typography variant="muted">—</Typography>;
  }

  return (
    <div className="flex items-center gap-1" data-row-click-ignore>
      <EditWalletDialog
        walletId={wallet.id}
        customerOptions={customerOptions}
        onSuccess={onWalletChanged}
      />
      <ArchiveWalletButton
        walletId={wallet.id}
        walletName={wallet.name}
        onSuccess={onWalletChanged}
      />
    </div>
  );
}

export function WalletsTable({
  wallets,
  customerOptions,
  onWalletChanged,
}: WalletsTableProps) {
  const total = wallets.length;

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <WalletsEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Wallet Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((wallet) => {
                const detailHref = wallet.customerId
                  ? `/customers/${wallet.customerId}`
                  : null;

                const cells = (
                  <>
                    <TableCell className="font-semibold">{wallet.name}</TableCell>
                    <TableCell>{TYPE_LABELS[wallet.type]}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[18rem] whitespace-normal">
                      {displayValue(wallet.description)}
                    </TableCell>
                    <TableCell>
                      {displayValue(wallet.customerName)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={walletStatusLabel(wallet)}
                        tone={walletStatusTone(wallet)}
                      />
                    </TableCell>
                    <TableCell data-row-click-ignore>
                      <WalletActionsCell
                        wallet={wallet}
                        customerOptions={customerOptions}
                        onWalletChanged={onWalletChanged}
                      />
                    </TableCell>
                  </>
                );

                if (detailHref) {
                  return (
                    <ClickableTableRow key={wallet.id} href={detailHref}>
                      {cells}
                    </ClickableTableRow>
                  );
                }

                return <TableRow key={wallet.id}>{cells}</TableRow>;
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Typography variant="muted">
        {total === 0
          ? "No wallets to display"
          : `Showing ${total} wallet${total === 1 ? "" : "s"}`}
      </Typography>
    </div>
  );
}
