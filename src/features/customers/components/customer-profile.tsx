import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import { ArchiveCustomerButton } from "@/features/customers/components/archive-customer-button";
import { CustomerHistorySection } from "@/features/customers/components/customer-history-section";
import { CustomerWalletsSection } from "@/features/customers/components/customer-wallets-section";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import type { CustomerProfile } from "@/features/customers/domain/types";
import type { CustomerHistoryResult } from "@/features/transactions";
import type { CustomerWalletBalanceRow } from "@/features/wallets";
import { cn } from "@/lib/utils";

type CustomerProfileViewProps = {
  customer: CustomerProfile;
  wallets: CustomerWalletBalanceRow[];
  history: CustomerHistoryResult;
};

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export function CustomerProfileView({
  customer,
  wallets,
  history,
}: CustomerProfileViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                href={
                  customer.isArchived
                    ? "/customers?status=archived"
                    : "/customers"
                }
              />
            }
            className="text-muted-foreground -ml-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to customers
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Typography variant="h3" as="h2">
                {customer.fullName}
              </Typography>
              <StatusBadge
                isActive={customer.isActive}
                isArchived={customer.isArchived}
              />
            </div>
            <Typography variant="muted">
              Code: {displayValue(customer.code)}
            </Typography>
          </div>
        </div>

        {customer.isArchived ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <EditCustomerDialog
              customerId={customer.id}
              triggerVariant="default"
              triggerSize="default"
              triggerLabel="Edit"
            />
            <ArchiveCustomerButton
              customerId={customer.id}
              customerName={customer.fullName}
            />
          </div>
        )}
      </div>

      <section className="ring-foreground/10 space-y-5 rounded-xl p-6 ring-1">
        <Typography variant="h4">Customer information</Typography>

        <dl className="space-y-4">
          <InfoRow label="Phone" value={displayValue(customer.phone)} />
          <InfoRow label="Address" value={displayValue(customer.address)} />
          <InfoRow
            label="National ID"
            value={displayValue(customer.nationalId)}
          />
          <InfoRow label="Notes" value={displayValue(customer.notes)} />
          <InfoRow
            label="Created date"
            value={formatDateTime(customer.createdAt)}
          />
          <InfoRow
            label="Updated date"
            value={formatDateTime(customer.updatedAt)}
          />
        </dl>
      </section>

      <CustomerWalletsSection wallets={wallets} />

      <CustomerHistorySection customerId={customer.id} history={history} />
    </div>
  );
}
