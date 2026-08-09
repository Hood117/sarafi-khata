"use client";

import { Download, Loader2 } from "lucide-react";
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
  receiveHawalaAction,
  type HawalaFieldErrors as HawalaActionFieldErrors,
} from "@/features/hawala/actions/hawala-actions";
import { loadHawalaFormOptionsAction } from "@/features/hawala/actions/hawala-form-options-action";
import {
  emptyHawalaFormValues,
  HawalaForm,
  type HawalaFormValues,
} from "@/features/hawala/components/hawala-form";
import type { HawalaFieldErrors } from "@/features/hawala/schemas/hawala";
import {
  resolveCashWalletId,
  resolveHawalaClearingWalletId,
} from "@/features/wallets/domain/resolve-form-wallets";
import { useT } from "@/lib/i18n";

type HawalaFormOptions = Awaited<
  ReturnType<typeof loadHawalaFormOptionsAction>
>;

type ReceiveHawalaDialogProps = {
  onSuccess?: (message: string) => void;
  triggerLabel?: string;
  title?: string;
  submitLabel?: string;
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
  onSuccess,
  triggerLabel,
  title,
  submitLabel,
}: ReceiveHawalaDialogProps) {
  const t = useT();
  const resolvedTrigger = triggerLabel ?? t.hawala.receive;
  const resolvedTitle = title ?? t.hawala.receiveTitle;
  const resolvedSubmit = submitLabel ?? t.hawala.receive;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [options, setOptions] = useState<HawalaFormOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || options) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadHawalaFormOptionsAction()
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
      partnerSarafiId: values.partnerSarafiId,
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
      partnerCommissionAmount: values.partnerCommissionAmount || null,
      ownCommissionAmount: values.ownCommissionAmount || null,
    });

    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        fieldErrors: mapFieldErrors(result.fieldErrors),
      };
    }

    onSuccess?.(result.message);
    handleOpenChange(false);
    router.refresh();

    return {
      ok: true as const,
      message: result.message,
    };
  }

  const cashWallet = options
    ? resolveCashWalletId(options.cashWallets)
    : null;
  const clearingWallet = options
    ? resolveHawalaClearingWalletId(options.clearingWallets)
    : null;
  const initialValues = emptyHawalaFormValues({
    cashWalletId: cashWallet?.ok ? cashWallet.walletId : "",
    clearingWalletId: clearingWallet?.ok ? clearingWallet.walletId : "",
    currencyCode: options?.currencies[0]?.code,
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" />
        {resolvedTrigger}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedTitle}</DialogDescription>
        </DialogHeader>

        {loading || !options ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {loadError ?? t.common.loading}
          </div>
        ) : (
          <HawalaForm
            key={formKey}
            direction="RECEIVE"
            initialValues={initialValues}
            customers={options.customers}
            partners={options.partners}
            cashWallets={options.cashWallets}
            clearingWallets={options.clearingWallets}
            currencies={options.currencies}
            submitLabel={resolvedSubmit}
            errorFallbackMessage={t.hawala.receiveError}
            onCancel={() => handleOpenChange(false)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
