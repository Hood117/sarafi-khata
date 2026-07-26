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
import { createCurrencyAction } from "@/features/currencies/actions/currency-actions";
import {
  CurrencyForm,
  emptyCurrencyFormValues,
  type CurrencyFormValues,
} from "@/features/currencies/components/currency-form";

type AddCurrencyDialogProps = {
  onSuccess?: (message: string) => void;
};

export function AddCurrencyDialog({ onSuccess }: AddCurrencyDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: CurrencyFormValues) {
    const result = await createCurrencyAction({
      code: values.code,
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
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add Currency
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Currency</DialogTitle>
          <DialogDescription>
            Add a currency available for transactions and exchange rates.
          </DialogDescription>
        </DialogHeader>

        <CurrencyForm
          key={formKey}
          initialValues={emptyCurrencyFormValues}
          submitLabel="Save Currency"
          errorFallbackMessage="Unable to add currency. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
