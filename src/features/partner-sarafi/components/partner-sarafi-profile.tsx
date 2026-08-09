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
import type { HawalaDirection, HawalaListItem } from "@/features/hawala/domain/types";
import { EditPartnerSarafiDialog } from "@/features/partner-sarafi/components/edit-partner-sarafi-dialog";
import type { PartnerCurrencyOption } from "@/features/partner-sarafi/components/partner-sarafi-form";
import { PartnerSarafiCommissionSection } from "@/features/partner-sarafi/components/partner-sarafi-commission-section";
import { PartnerSarafiHawalaSection } from "@/features/partner-sarafi/components/partner-sarafi-hawala-section";
import { SetPartnerSarafiActiveButton } from "@/features/partner-sarafi/components/set-partner-sarafi-active-button";
import type {
  PartnerCommissionSummary,
  PartnerSarafiListItem,
} from "@/features/partner-sarafi/domain/types";
import { useT } from "@/lib/i18n";

type PartnerSarafiProfileViewProps = {
  partner: PartnerSarafiListItem;
  transfers: HawalaListItem[];
  commissionSummary: PartnerCommissionSummary;
  currencyOptions: PartnerCurrencyOption[];
  cashWallets: Array<{ id: string; label: string }>;
  search: string;
  direction: HawalaDirection | "all";
  initialTab?: "information" | "hawala" | "commission";
  returnTo: string;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export function PartnerSarafiProfileView({
  partner,
  transfers,
  commissionSummary,
  currencyOptions,
  cashWallets,
  search,
  direction,
  initialTab,
  returnTo,
}: PartnerSarafiProfileViewProps) {
  const t = useT();
  const defaultTab =
    initialTab ??
    (search.trim() || direction !== "all" ? "hawala" : "information");

  const location = [partner.city, partner.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/partner-sarafi" />}
            className="text-muted-foreground -ms-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            {t.partner.backToList}
          </Button>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Typography variant="h3" as="h2">
                {partner.name}
              </Typography>
              <StatusBadge
                label={partner.isActive ? t.common.active : t.common.inactive}
                tone={toneForRecordStatus(
                  partner.isActive ? "ACTIVE" : "INACTIVE",
                )}
              />
            </div>
            <Typography variant="muted">{displayValue(location)}</Typography>
            {partner.commissionRateLabel ? (
              <Typography variant="muted" className="text-sm">
                {t.partner.commission}: {partner.commissionRateLabel}
              </Typography>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditPartnerSarafiDialog
            partnerId={partner.id}
            currencyOptions={currencyOptions}
            triggerVariant="default"
            triggerSize="default"
            triggerLabel={t.common.edit}
          />
          <SetPartnerSarafiActiveButton
            partnerId={partner.id}
            partnerName={partner.name}
            isActive={partner.isActive}
          />
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="information">{t.partner.information}</TabsTrigger>
          <TabsTrigger value="commission">{t.partner.commission}</TabsTrigger>
          <TabsTrigger value="hawala">
            {t.partner.hawalaTab} ({transfers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="space-y-4 pt-2">
          <dl className="bg-card space-y-4 rounded-xl p-4 shadow-sm ring-1 ring-foreground/10">
            <InfoRow label={t.common.name} value={partner.name} />
            <InfoRow label={t.common.phone} value={displayValue(partner.phone)} />
            <InfoRow label={t.common.city} value={displayValue(partner.city)} />
            <InfoRow
              label={t.common.country}
              value={displayValue(partner.country)}
            />
            <InfoRow
              label={t.partner.commission}
              value={displayValue(partner.commissionRateLabel)}
            />
            <InfoRow label={t.common.notes} value={displayValue(partner.notes)} />
            <InfoRow
              label={t.common.date}
              value={formatDateTime(partner.createdAt)}
            />
            <InfoRow
              label={t.common.update}
              value={formatDateTime(partner.updatedAt)}
            />
          </dl>
        </TabsContent>

        <TabsContent value="commission" className="pt-2">
          <PartnerSarafiCommissionSection
            summary={commissionSummary}
            cashWallets={cashWallets}
            returnTo={returnTo.includes("tab=")
              ? returnTo
              : `${returnTo}${returnTo.includes("?") ? "&" : "?"}tab=commission`}
          />
        </TabsContent>

        <TabsContent value="hawala" className="pt-2">
          <PartnerSarafiHawalaSection
            partnerId={partner.id}
            transfers={transfers}
            search={search}
            direction={direction}
            returnTo={returnTo}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
