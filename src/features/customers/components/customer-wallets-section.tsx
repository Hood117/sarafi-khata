import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import type { CustomerWalletBalanceRow } from "@/features/wallets";
import { cn } from "@/lib/utils";

type CustomerWalletsSectionProps = {
  wallets: CustomerWalletBalanceRow[];
};

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

export function CustomerWalletsSection({
  wallets,
}: CustomerWalletsSectionProps) {
  return (
    <section className="ring-foreground/10 space-y-4 rounded-xl p-6 ring-1">
      <Typography variant="h4">Wallets</Typography>

      {wallets.length === 0 ? (
        <Typography variant="muted">
          No wallets linked to this customer yet.
        </Typography>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Wallet Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Current Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((wallet) => (
                <TableRow
                  key={`${wallet.walletId}:${wallet.currencyCode}`}
                >
                  <TableCell className="font-medium">
                    {wallet.walletName}
                  </TableCell>
                  <TableCell>{wallet.currencyCode}</TableCell>
                  <TableCell className="tabular-nums">
                    {wallet.balanceDisplay}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      isActive={wallet.isActive}
                      isArchived={wallet.isArchived}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
