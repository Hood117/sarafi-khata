import type { WalletType } from "@/generated/prisma/client";
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
import { cn } from "@/lib/utils";

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

function StatusBadge({
  isActive,
  isArchived,
}: {
  isActive: boolean;
  isArchived: boolean;
}) {
  if (isArchived) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
        Archived
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        isActive
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
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
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {total === 0 ? (
          <WalletsEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Wallet Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((wallet) => (
                <TableRow key={wallet.id}>
                  <TableCell className="font-medium">{wallet.name}</TableCell>
                  <TableCell>{TYPE_LABELS[wallet.type]}</TableCell>
                  <TableCell>{displayValue(wallet.customerName)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      isActive={wallet.isActive}
                      isArchived={wallet.isArchived}
                    />
                  </TableCell>
                  <TableCell>
                    {wallet.isArchived ? (
                      <Typography variant="muted">—</Typography>
                    ) : (
                      <div className="flex items-center gap-1">
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
