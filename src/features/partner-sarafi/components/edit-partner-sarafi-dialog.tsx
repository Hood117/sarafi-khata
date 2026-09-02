"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getPartnerSarafiForEditAction,
  updatePartnerSarafiAction,
} from "@/features/partner-sarafi/actions/partner-sarafi-actions";
import {
  emptyPartnerSarafiFormValues,
  PartnerSarafiForm,
  type PartnerCurrencyOption,
  type PartnerCustomerOption,
  type PartnerSarafiFormValues,
} from "@/features/partner-sarafi/components/partner-sarafi-form";
import { useT } from "@/lib/i18n";

type EditPartnerSarafiDialogProps = {
  partnerId: string;
  customerOptions: PartnerCustomerOption[];
  currencyOptions: PartnerCurrencyOption[];
  onSuccess?: (message: string) => void;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "lg";
  triggerLabel?: string;
};

export function EditPartnerSarafiDialog({
  partnerId,
  customerOptions,
  currencyOptions,
  onSuccess,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerLabel,
}: EditPartnerSarafiDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [initialValues, setInitialValues] = useState<PartnerSarafiFormValues>(
    emptyPartnerSarafiFormValues,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void getPartnerSarafiForEditAction(partnerId).then((result) => {
      if (cancelled) {
        return;
      }
      setIsLoading(false);
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setInitialValues({
        customerId: result.partner.customerId ?? "",
        name: result.partner.name,
        phone: result.partner.phone ?? "",
        city: result.partner.city ?? "",
        country: result.partner.country ?? "",
        notes: result.partner.notes ?? "",
        isActive: result.partner.isActive,
        commissionEnabled: result.partner.commissionEnabled,
        commissionPerAmount:
          result.partner.commissionPerAmount ||
          emptyPartnerSarafiFormValues.commissionPerAmount,
        commissionFeeAmount:
          result.partner.commissionFeeAmount ||
          emptyPartnerSarafiFormValues.commissionFeeAmount,
        commissionCurrencyCode:
          result.partner.commissionCurrencyCode ||
          emptyPartnerSarafiFormValues.commissionCurrencyCode,
      });
      setFormKey((current) => current + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [open, partnerId]);

  async function handleSubmit(values: PartnerSarafiFormValues) {
    const result = await updatePartnerSarafiAction({
      id: partnerId,
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
    window.setTimeout(() => setOpen(false), 700);
    return { ok: true as const, message: result.message };
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={triggerVariant} size={triggerSize} />}
      >
        {triggerLabel ?? t.common.edit}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.partner.edit}</DialogTitle>
          <DialogDescription>{t.partner.commissionOnHawala}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground text-sm">{t.partner.loadingPartner}</p>
        ) : (
          <PartnerSarafiForm
            key={formKey}
            initialValues={initialValues}
            customerOptions={customerOptions}
            currencyOptions={currencyOptions}
            submitLabel={t.common.saveChanges}
            errorFallbackMessage={t.common.tryAgain}
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
