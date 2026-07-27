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
import {
  depositAction,
  manualAdjustmentAction,
  withdrawalAction,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
import {
  emptyTransactionFormValues,
  TransactionForm,
  type TransactionFormValues,
} from "@/features/transactions/components/transaction-form";
import type {
  TransactionCurrencyOption,
  TransactionCustomerOption,
  TransactionWalletOption,
} from "@/features/transactions/domain/types";
import type { TransactionFormFieldErrors } from "@/features/transactions/schemas/transaction-form";

type AddTransactionDialogProps = {
  customers: TransactionCustomerOption[];
  wallets: TransactionWalletOption[];
  currencies: TransactionCurrencyOption[];
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

  // Deposit/withdrawal hide wallet fields — surface those errors on customer.
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
  customers,
  wallets,
  currencies,
  onSuccess,
}: AddTransactionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
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
          <DialogTitle>New Transaction</DialogTitle>
          <DialogDescription>
            Post a deposit or withdrawal for a customer, or a manual adjustment.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <TransactionForm
            key={formKey}
            initialValues={emptyTransactionFormValues}
            customers={customers}
            wallets={wallets}
            currencies={currencies}
            submitLabel="Post Transaction"
            errorFallbackMessage="Unable to post transaction. Please try again."
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
