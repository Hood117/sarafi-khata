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
import { createExchangeRateAction } from "@/features/exchange-rates/actions/exchange-rate-actions";
import {
  emptyExchangeRateFormValues,
  ExchangeRateForm,
  type ExchangeRateFormValues,
} from "@/features/exchange-rates/components/exchange-rate-form";
import type { ExchangeRateCurrencyOption } from "@/features/exchange-rates/domain/types";

type AddExchangeRateDialogProps = {
  currencies: ExchangeRateCurrencyOption[];
  onSuccess?: (message: string) => void;
};

export function AddExchangeRateDialog({
  currencies,
  onSuccess,
}: AddExchangeRateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: ExchangeRateFormValues) {
    const result = await createExchangeRateAction({
      baseCurrencyId: values.baseCurrencyId,
      quoteCurrencyId: values.quoteCurrencyId,
      rate: values.rate,
      effectiveDate: values.effectiveDate,
      isActive: values.isActive,
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

    return {
      ok: true as const,
      message: result.message,
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add Rate
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Exchange Rate</DialogTitle>
          <DialogDescription>
            Enter quote units per 1 base unit. Example: 1 USD = 70 AFN.
          </DialogDescription>
        </DialogHeader>

        <ExchangeRateForm
          key={formKey}
          initialValues={emptyExchangeRateFormValues()}
          currencies={currencies}
          submitLabel="Save Rate"
          errorFallbackMessage="Unable to add exchange rate. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
