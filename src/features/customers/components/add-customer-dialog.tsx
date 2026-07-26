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
  type CustomerFormValues,
} from "@/features/customers/components/customer-form";

type AddCustomerDialogProps = {
  onSuccess?: (message: string) => void;
};

export function AddCustomerDialog({ onSuccess }: AddCustomerDialogProps) {
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
    const result = await createCustomerAction(values);

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
        Add Customer
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
          <DialogDescription>
            Create a customer record for exchange and wallet operations.
          </DialogDescription>
        </DialogHeader>

        <CustomerForm
          key={formKey}
          initialValues={emptyCustomerFormValues}
          submitLabel="Save Customer"
          errorFallbackMessage="Unable to add customer. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
