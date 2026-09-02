"use client";

import { AddPartnerSarafiDialog } from "@/features/partner-sarafi/components/add-partner-sarafi-dialog";
import type {
  PartnerCurrencyOption,
  PartnerCustomerOption,
} from "@/features/partner-sarafi/components/partner-sarafi-form";
import { useT } from "@/lib/i18n";

type PartnerSarafiPageHeaderProps = {
  customerOptions: PartnerCustomerOption[];
  currencyOptions: PartnerCurrencyOption[];
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function PartnerSarafiPageHeader({
  customerOptions,
  currencyOptions,
  onSuccess,
  successMessage,
}: PartnerSarafiPageHeaderProps) {
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddPartnerSarafiDialog
          customerOptions={customerOptions}
          currencyOptions={currencyOptions}
          onSuccess={onSuccess}
          triggerLabel={t.partner.add}
          title={t.partner.add}
        />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success animate-in fade-in-0 slide-in-from-top-1 rounded-xl px-3.5 py-2.5 text-sm font-medium ring-1 ring-success/15 duration-200"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
