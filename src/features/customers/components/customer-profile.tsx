"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Typography } from "@/design-system/typography";
import { AddWalletMoneyDialog } from "@/features/customers/components/add-wallet-money-dialog";
import { ArchiveCustomerButton } from "@/features/customers/components/archive-customer-button";
import { CustomerBalancesSection } from "@/features/customers/components/customer-balances-section";
import type { CurrencyOption } from "@/features/customers/components/customer-form";
import { CustomerHistorySection } from "@/features/customers/components/customer-history-section";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import type { CustomerProfile } from "@/features/customers/domain/types";
import type { CustomerHistoryResult } from "@/features/transactions";
import type { CustomerCurrencyBalance } from "@/features/wallets";
import { useT } from "@/lib/i18n";

type CustomerProfileViewProps = {
  customer: CustomerProfile;
  balances: CustomerCurrencyBalance[];
  history: CustomerHistoryResult;
  currencyOptions: CurrencyOption[];
  initialTab?: "information" | "balances" | "history";
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function hasActiveHistoryQuery(history: CustomerHistoryResult): boolean {
  const { filters, page } = history;
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.type ||
      filters.currencyCode ||
      filters.reference ||
      page > 1,
  );
}

export function CustomerProfileView({
  customer,
  balances,
  history,
  currencyOptions,
  initialTab,
}: CustomerProfileViewProps) {
  const t = useT();
  const defaultTab =
    initialTab ??
    (hasActiveHistoryQuery(history) ? "history" : "information");

  const statusLabel = customer.isArchived
    ? t.common.archived
    : customer.isActive
      ? t.common.active
      : t.common.inactive;

  return (
    <div className="space-y-2">
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
            className="text-muted-foreground -ms-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            {t.customers.backToList}
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Typography variant="h3" as="h2">
                {customer.fullName}
              </Typography>
              <StatusBadge
                label={statusLabel}
                tone={toneForRecordStatus(
                  customer.isArchived
                    ? "ARCHIVED"
                    : customer.isActive
                      ? "ACTIVE"
                      : "INACTIVE",
                )}
              />
            </div>
            <Typography variant="muted">
              {t.customers.customerCode}: {displayValue(customer.code)}
            </Typography>
          </div>
        </div>

        {customer.isArchived ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <AddWalletMoneyDialog
              customerId={customer.id}
              customerName={customer.fullName}
              currencyOptions={currencyOptions}
            />
            <EditCustomerDialog
              customerId={customer.id}
              triggerVariant="default"
              triggerSize="default"
              triggerLabel={t.common.edit}
            />
            <ArchiveCustomerButton
              customerId={customer.id}
              customerName={customer.fullName}
            />
          </div>
        )}
      </div>

      <Tabs
        key={defaultTab}
        defaultValue={defaultTab}
        className="w-full gap-3"
      >
        <TabsList className="w-full max-w-md sm:w-fit">
          <TabsTrigger value="information">{t.customers.information}</TabsTrigger>
          <TabsTrigger value="balances">{t.customers.balances}</TabsTrigger>
          <TabsTrigger value="history">{t.customers.history}</TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="outline-none">
          <section
            className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
            aria-labelledby="customer-information-heading"
          >
            <Typography
              variant="h4"
              id="customer-information-heading"
              className="font-bold"
            >
              {t.customers.customerInfo}
            </Typography>

            <dl className="space-y-4">
              <InfoRow
                label={t.customers.customerCode}
                value={displayValue(customer.code)}
              />
              <InfoRow label={t.common.name} value={customer.fullName} />
              <InfoRow
                label={t.customers.fatherName}
                value={displayValue(customer.fatherName)}
              />
              <InfoRow label={t.common.phone} value={displayValue(customer.phone)} />
              <InfoRow
                label={t.common.address}
                value={displayValue(customer.address)}
              />
              <InfoRow
                label={t.customers.idNumber}
                value={displayValue(customer.nationalId)}
              />
              <InfoRow label={t.common.notes} value={displayValue(customer.notes)} />
              <InfoRow
                label={t.common.date}
                value={formatDateTime(customer.createdAt)}
              />
              <InfoRow
                label={t.common.update}
                value={formatDateTime(customer.updatedAt)}
              />
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="balances" className="outline-none">
          <CustomerBalancesSection balances={balances} />
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          <CustomerHistorySection customerId={customer.id} history={history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
