"use client";

import { Loader2 } from "lucide-react";
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
  getExchangeRateForEditAction,
  updateExchangeRateAction,
} from "@/features/exchange-rates/actions/exchange-rate-actions";
import {
  emptyExchangeRateFormValues,
  ExchangeRateForm,
  type ExchangeRateFormValues,
} from "@/features/exchange-rates/components/exchange-rate-form";
import type { ExchangeRateCurrencyOption } from "@/features/exchange-rates/domain/types";
import { useT } from "@/lib/i18n";

type EditExchangeRateDialogProps = {
  exchangeRateId: string;
  currencies: ExchangeRateCurrencyOption[];
  onSuccess?: (message: string) => void;
};

export function EditExchangeRateDialog({
  exchangeRateId,
  currencies,
  onSuccess,
}: EditExchangeRateDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<ExchangeRateFormValues>(
    emptyExchangeRateFormValues(),
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadRate() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await getExchangeRateForEditAction(exchangeRateId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setInitialValues(emptyExchangeRateFormValues());
          return;
        }

        setInitialValues({
          baseCurrencyId: result.exchangeRate.baseCurrencyId,
          quoteCurrencyId: result.exchangeRate.quoteCurrencyId,
          rate: result.exchangeRate.rate,
          effectiveDate: result.exchangeRate.effectiveDate,
          isActive: result.exchangeRate.isActive,
        });
        setFormKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load exchange rate. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRate();

    return () => {
      cancelled = true;
    };
  }, [open, exchangeRateId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLoadError(null);
      setIsLoading(false);
      setInitialValues(emptyExchangeRateFormValues());
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: ExchangeRateFormValues) {
    const result = await updateExchangeRateAction({
      id: exchangeRateId,
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
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.exchangeRates.edit}</DialogTitle>
          <DialogDescription>
            Update the pair, rate, effective date, or status.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading exchange rate...
          </div>
        ) : loadError ? (
          <div className="space-y-4">
            <p className="text-destructive text-sm" role="alert">
              {loadError}
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <ExchangeRateForm
            key={formKey}
            initialValues={initialValues}
            currencies={currencies}
            submitLabel={t.common.saveChanges}
            errorFallbackMessage="Unable to update exchange rate. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
