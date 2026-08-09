"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchInput } from "@/components/ui/search-input";
import { Typography } from "@/design-system/typography";
import type { PartnerCurrencyOption } from "@/features/partner-sarafi/components/partner-sarafi-form";
import { PartnerSarafiPageHeader } from "@/features/partner-sarafi/components/partner-sarafi-page-header";
import { PartnerSarafiTable } from "@/features/partner-sarafi/components/partner-sarafi-table";
import type { PartnerSarafiListItem } from "@/features/partner-sarafi/domain/types";
import { useT } from "@/lib/i18n";

type PartnerSarafiViewProps = {
  partners: PartnerSarafiListItem[];
  currencyOptions: PartnerCurrencyOption[];
};

function matchesPartner(partner: PartnerSarafiListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return [
    partner.name,
    partner.phone ?? "",
    partner.city ?? "",
    partner.country ?? "",
    partner.commissionRateLabel ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function PartnerSarafiView({
  partners,
  currencyOptions,
}: PartnerSarafiViewProps) {
  const t = useT();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const filtered = useMemo(
    () => partners.filter((partner) => matchesPartner(partner, search)),
    [partners, search],
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Typography variant="h2">{t.pages.partnerSarafi}</Typography>
        <Typography variant="muted">{t.partner.emptyHint}</Typography>
      </div>

      <PartnerSarafiPageHeader
        currencyOptions={currencyOptions}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />

      <SearchInput
        value={search}
        placeholder={t.partner.searchPlaceholder}
        aria-label={t.partner.searchPlaceholder}
        onChange={(event) => setSearch(event.target.value)}
        containerClassName="max-w-xl"
      />

      <PartnerSarafiTable
        partners={filtered}
        currencyOptions={currencyOptions}
        onPartnerChanged={setSuccessMessage}
      />
    </div>
  );
}
