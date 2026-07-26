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
  getWalletForEditAction,
  updateWalletAction,
} from "@/features/wallets/actions/wallet-actions";
import {
  emptyWalletFormValues,
  WalletForm,
  type WalletFormValues,
} from "@/features/wallets/components/wallet-form";
import type { WalletCustomerOption } from "@/features/wallets/domain/types";

type EditWalletDialogProps = {
  walletId: string;
  customerOptions: WalletCustomerOption[];
  onSuccess?: (message: string) => void;
};

export function EditWalletDialog({
  walletId,
  customerOptions,
  onSuccess,
}: EditWalletDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<WalletFormValues>(
    emptyWalletFormValues,
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadWallet() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await getWalletForEditAction(walletId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setInitialValues(emptyWalletFormValues);
          return;
        }

        setInitialValues({
          name: result.wallet.name,
          type: result.wallet.type,
          customerId: result.wallet.customerId ?? "",
        });
        setFormKey((current) => current + 1);
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load wallet. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadWallet();

    return () => {
      cancelled = true;
    };
  }, [open, walletId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLoadError(null);
      setIsLoading(false);
      setInitialValues(emptyWalletFormValues);
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: WalletFormValues) {
    const result = await updateWalletAction({
      id: walletId,
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
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Wallet</DialogTitle>
          <DialogDescription>
            Update wallet details. Creation date is preserved.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading wallet...
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
          <WalletForm
            key={formKey}
            initialValues={initialValues}
            customerOptions={customerOptions}
            submitLabel="Save Changes"
            errorFallbackMessage="Unable to update wallet. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
