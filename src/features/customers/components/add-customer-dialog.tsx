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
import { createCustomerAction } from "@/features/customers/actions/customer-actions";
import {
  CustomerForm,
  emptyCustomerFormValues,
  type CurrencyOption,
  type CustomerFormValues,
} from "@/features/customers/components/customer-form";
import { useT } from "@/lib/i18n";

type AddCustomerDialogProps = {
  currencyOptions: CurrencyOption[];
  onSuccess?: (message: string) => void;
};

export function AddCustomerDialog({
  currencyOptions,
  onSuccess,
}: AddCustomerDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: CustomerFormValues) {
    const result = await createCustomerAction({
      fullName: values.fullName,
      fatherName: values.fatherName,
      phone: values.phone,
      address: values.address,
      nationalId: values.nationalId,
      notes: values.notes,
      openingBalanceAmount: values.openingBalanceAmount,
      openingBalanceCurrencyCode: values.openingBalanceCurrencyCode,
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
        {t.customers.add}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.customers.add}</DialogTitle>
          <DialogDescription>
            Create a customer (a wallet is created automatically) and optionally
            record opening wallet money they give to Saraf.
          </DialogDescription>
        </DialogHeader>

        <CustomerForm
          key={formKey}
          showOpeningBalance
          currencyOptions={currencyOptions}
          initialValues={{
            ...emptyCustomerFormValues,
            openingBalanceCurrencyCode: currencyOptions[0]?.code ?? "",
          }}
          submitLabel={t.customers.saveCustomer}
          errorFallbackMessage="Unable to add customer. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
