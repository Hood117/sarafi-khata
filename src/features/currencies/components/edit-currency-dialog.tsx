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
  getCurrencyForEditAction,
  updateCurrencyAction,
} from "@/features/currencies/actions/currency-actions";
import {
  CurrencyForm,
  emptyCurrencyFormValues,
  type CurrencyFormValues,
} from "@/features/currencies/components/currency-form";
import { useT } from "@/lib/i18n";

type EditCurrencyDialogProps = {
  currencyId: string;
  onSuccess?: (message: string) => void;
};

export function EditCurrencyDialog({
  currencyId,
  onSuccess,
}: EditCurrencyDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<CurrencyFormValues>(
    emptyCurrencyFormValues,
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadCurrency() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await getCurrencyForEditAction(currencyId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setInitialValues(emptyCurrencyFormValues);
          return;
        }

        setInitialValues({
          code: result.currency.code,
          name: result.currency.name,
          symbol: result.currency.symbol ?? "",
          isActive: result.currency.isActive,
        });
        setFormKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load currency. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCurrency();

    return () => {
      cancelled = true;
    };
  }, [open, currencyId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLoadError(null);
      setIsLoading(false);
      setInitialValues(emptyCurrencyFormValues);
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: CurrencyFormValues) {
    const result = await updateCurrencyAction({
      id: currencyId,
      name: values.name,
      symbol: values.symbol,
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
          <DialogTitle>{t.currencies.edit}</DialogTitle>
          <DialogDescription>
            Update currency details. The code cannot be changed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading currency...
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
          <CurrencyForm
            key={formKey}
            initialValues={initialValues}
            codeReadOnly
            submitLabel={t.common.saveChanges}
            errorFallbackMessage="Unable to update currency. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
