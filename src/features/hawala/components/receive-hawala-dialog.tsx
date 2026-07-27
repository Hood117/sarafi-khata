"use client";

import { Download } from "lucide-react";
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
  receiveHawalaAction,
  type HawalaFieldErrors as HawalaActionFieldErrors,
} from "@/features/hawala/actions/hawala-actions";
import {
  emptyHawalaFormValues,
  HawalaForm,
  type HawalaFormValues,
} from "@/features/hawala/components/hawala-form";
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaWalletOption,
} from "@/features/hawala/domain/types";
import type { HawalaFieldErrors } from "@/features/hawala/schemas/hawala";
import {
  resolveCashWalletId,
  resolveHawalaClearingWalletId,
} from "@/features/wallets/domain/resolve-form-wallets";

type ReceiveHawalaDialogProps = {
  customers: HawalaCustomerOption[];
  cashWallets: HawalaWalletOption[];
  clearingWallets: HawalaWalletOption[];
  currencies: HawalaCurrencyOption[];
  onSuccess?: (message: string) => void;
};

function mapFieldErrors(
  fieldErrors?: HawalaActionFieldErrors,
): HawalaFieldErrors | undefined {
  return fieldErrors;
}

function parseValueDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function ReceiveHawalaDialog({
  customers,
  cashWallets,
  clearingWallets,
  currencies,
  onSuccess,
}: ReceiveHawalaDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const cashWallet = resolveCashWalletId(cashWallets);
  const clearingWallet = resolveHawalaClearingWalletId(clearingWallets);
  const initialValues = emptyHawalaFormValues({
    cashWalletId: cashWallet.ok ? cashWallet.walletId : "",
    clearingWalletId: clearingWallet.ok ? clearingWallet.walletId : "",
    currencyCode: currencies[0]?.code,
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
    }
  }

  async function handleSubmit(values: HawalaFormValues) {
    const result = await receiveHawalaAction({
      senderName:
        values.senderSource === "external" ? values.senderName : "",
      senderPhone: values.senderPhone || null,
      receiverName:
        values.receiverSource === "external" ? values.receiverName : "",
      receiverPhone: values.receiverPhone || null,
      senderCustomerId:
        values.senderSource === "customer"
          ? values.senderCustomerId || null
          : null,
      receiverCustomerId:
        values.receiverSource === "customer"
          ? values.receiverCustomerId || null
          : null,
      partnerSarafi: values.partnerSarafi,
      originCity: values.originCity,
      originCountry: values.originCountry,
      destinationCity: values.destinationCity,
      destinationCountry: values.destinationCountry,
      reference: values.reference,
      currencyCode: values.currencyCode,
      amount: values.amount,
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
      cashWalletId: values.cashWalletId,
      clearingWalletId: values.clearingWalletId,
      valueDate: parseValueDate(values.valueDate),
    });

    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        fieldErrors: mapFieldErrors(result.fieldErrors),
      };
    }

    onSuccess?.(result.message);
    router.push(`/hawala/${result.hawalaId}`);
    router.refresh();

    return {
      ok: true as const,
      message: result.message,
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" />
        Receive Hawala
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive Hawala</DialogTitle>
          <DialogDescription>
            Record a receive transfer. Internal cash and clearing accounts are
            applied automatically.
          </DialogDescription>
        </DialogHeader>

        <HawalaForm
          key={formKey}
          direction="RECEIVE"
          initialValues={initialValues}
          customers={customers}
          cashWallets={cashWallets}
          clearingWallets={clearingWallets}
          currencies={currencies}
          submitLabel="Receive Hawala"
          errorFallbackMessage="Unable to receive hawala. Please try again."
          onCancel={() => handleOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
