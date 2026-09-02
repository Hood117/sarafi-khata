"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPartnerSarafiAction } from "@/features/partner-sarafi/actions/partner-sarafi-actions";
import {
  emptyPartnerSarafiFormValues,
  PartnerSarafiForm,
  type PartnerCurrencyOption,
  type PartnerCustomerOption,
  type PartnerSarafiFormValues,
} from "@/features/partner-sarafi/components/partner-sarafi-form";
import { useT } from "@/lib/i18n";

type AddPartnerSarafiDialogProps = {
  customerOptions: PartnerCustomerOption[];
  currencyOptions: PartnerCurrencyOption[];
  onSuccess?: (message: string) => void;
  triggerLabel?: string;
  title?: string;
  submitLabel?: string;
};

export function AddPartnerSarafiDialog({
  customerOptions,
  currencyOptions,
  onSuccess,
  triggerLabel,
  title,
  submitLabel,
}: AddPartnerSarafiDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const resolvedTrigger = triggerLabel ?? t.partner.add;
  const resolvedTitle = title ?? t.partner.add;
  const resolvedSubmit = submitLabel ?? t.partner.savePartner;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: PartnerSarafiFormValues) {
    const result = await createPartnerSarafiAction({
      customerId: values.customerId,
      name: values.name,
      phone: values.phone,
      city: values.city,
      country: values.country,
      notes: values.notes,
      isActive: values.isActive,
      commissionEnabled: values.commissionEnabled,
      commissionPerAmount: values.commissionPerAmount,
      commissionFeeAmount: values.commissionFeeAmount,
      commissionCurrencyCode: values.commissionCurrencyCode,
    });

    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        fieldErrors: result.fieldErrors,
      };
    }

    router.refresh();
    window.setTimeout(() => {
      handleOpenChange(false);
    }, 700);

    return { ok: true as const, message: result.message };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        {resolvedTrigger}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{t.partner.emptyHint}</DialogDescription>
        </DialogHeader>

        <PartnerSarafiForm
          key={formKey}
          initialValues={emptyPartnerSarafiFormValues}
          customerOptions={customerOptions}
          currencyOptions={currencyOptions}
          requireCustomer
          submitLabel={resolvedSubmit}
          errorFallbackMessage={t.common.tryAgain}
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
