"use client";

import { useT } from "@/lib/i18n";
import { Loader2, Plus } from "lucide-react";
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
  depositAction,
  manualAdjustmentAction,
  withdrawalAction,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
import { loadTransactionFormOptionsAction } from "@/features/transactions/actions/transaction-form-options-action";
import {
  emptyTransactionFormValues,
  TransactionForm,
  type TransactionFormValues,
} from "@/features/transactions/components/transaction-form";
import type { TransactionFormOptions } from "@/features/transactions/domain/types";
import type { TransactionFormFieldErrors } from "@/features/transactions/schemas/transaction-form";

type AddTransactionDialogProps = {
  onSuccess?: (message: string) => void;
};

function mapActionFieldErrors(
  fieldErrors?: TransactionFieldErrors,
  type?: TransactionFormValues["type"],
): TransactionFormFieldErrors | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  const walletId =
    fieldErrors.customerWalletId ??
    fieldErrors.debitWalletId ??
    fieldErrors.walletId;
  const offsetWalletId =
    fieldErrors.cashWalletId ??
    fieldErrors.creditWalletId ??
    fieldErrors.offsetWalletId;

  if (type === "DEPOSIT" || type === "WITHDRAWAL") {
    return {
      type: undefined,
      customerId: fieldErrors.customerId ?? walletId ?? offsetWalletId,
      walletId: undefined,
      offsetWalletId: undefined,
      currencyCode: fieldErrors.currencyCode,
      amount: fieldErrors.amount,
      reference: fieldErrors.reference,
      notes: fieldErrors.description ?? fieldErrors.notes,
    };
  }

  return {
    type: undefined,
    customerId: fieldErrors.customerId,
    walletId,
    offsetWalletId,
    currencyCode: fieldErrors.currencyCode,
    amount: fieldErrors.amount,
    reference: fieldErrors.reference,
    notes: fieldErrors.description ?? fieldErrors.notes,
  };
}

export function AddTransactionDialog({
  onSuccess,
}: AddTransactionDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [options, setOptions] = useState<TransactionFormOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || options) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadTransactionFormOptionsAction()
      .then((next) => {
        if (!cancelled) {
          setOptions(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(t.common.error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, options, t.common.error]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
      setOptions(null);
      setLoadError(null);
    }
  }

  async function handleSubmit(values: TransactionFormValues) {
    const notes = values.notes.trim() === "" ? null : values.notes.trim();

    const result =
      values.type === "DEPOSIT"
        ? await depositAction({
            reference: values.reference,
            customerWalletId: values.walletId,
            cashWalletId: values.offsetWalletId,
            currencyCode: values.currencyCode,
            amount: values.amount,
            description: notes,
          })
        : values.type === "WITHDRAWAL"
          ? await withdrawalAction({
              reference: values.reference,
              customerWalletId: values.walletId,
              cashWalletId: values.offsetWalletId,
              currencyCode: values.currencyCode,
              amount: values.amount,
              description: notes,
            })
          : await manualAdjustmentAction({
              reference: values.reference,
              debitWalletId: values.walletId,
              creditWalletId: values.offsetWalletId,
              currencyCode: values.currencyCode,
              amount: values.amount,
              description: notes,
              customerId: values.customerId || null,
            });

    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        fieldErrors: mapActionFieldErrors(result.fieldErrors, values.type),
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
        New Transaction
      </DialogTrigger>

      <DialogContent className="flex max-h-[min(90dvh,44rem)] w-full flex-col gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t.transactions.newTransaction}</DialogTitle>
          <DialogDescription>
            Post a deposit or withdrawal for a customer, or a manual adjustment.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {loading || !options ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {loadError ?? t.common.loading}
            </div>
          ) : (
            <TransactionForm
              key={formKey}
              initialValues={emptyTransactionFormValues}
              customers={options.customers}
              wallets={options.wallets}
              currencies={options.currencies}
              submitLabel="Post Transaction"
              errorFallbackMessage="Unable to post transaction. Please try again."
              onCancel={() => handleOpenChange(false)}
              onSubmit={handleSubmit}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
