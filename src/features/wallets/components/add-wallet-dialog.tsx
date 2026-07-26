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
import { createWalletAction } from "@/features/wallets/actions/wallet-actions";
import {
  emptyWalletFormValues,
  WalletForm,
  type WalletFormValues,
} from "@/features/wallets/components/wallet-form";
import type { WalletCustomerOption } from "@/features/wallets/domain/types";

type AddWalletDialogProps = {
  customerOptions: WalletCustomerOption[];
  onSuccess?: (message: string) => void;
};

export function AddWalletDialog({
  customerOptions,
  onSuccess,
}: AddWalletDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: WalletFormValues) {
    const result = await createWalletAction({
      name: values.name,
      type: values.type,
      customerId: values.type === "CUSTOMER" ? values.customerId : null,
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
        Add Wallet
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Wallet</DialogTitle>
          <DialogDescription>
            Create a vault, till, system, or customer wallet.
          </DialogDescription>
        </DialogHeader>

        <WalletForm
          key={formKey}
          initialValues={emptyWalletFormValues}
          customerOptions={customerOptions}
          submitLabel="Save Wallet"
          errorFallbackMessage="Unable to add wallet. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
