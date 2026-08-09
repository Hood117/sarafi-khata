"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addExternalMoneyAction } from "@/features/external-money/actions/external-money-actions";
import type {
  ExternalMoneyCashWalletOption,
  ExternalMoneyCurrencyOption,
} from "@/features/external-money/services/get-external-money-page-data";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type AddExternalMoneyDialogProps = {
  currencies: ExternalMoneyCurrencyOption[];
  cashWallets: ExternalMoneyCashWalletOption[];
  defaultCashWalletId: string;
  onSuccess?: (message: string) => void;
};

export function AddExternalMoneyDialog({
  currencies,
  cashWallets,
  defaultCashWalletId,
  onSuccess,
}: AddExternalMoneyDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? "");
  const [cashWalletId, setCashWalletId] = useState(defaultCashWalletId);
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string;
    currencyCode?: string;
    cashWalletId?: string;
    notes?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setAmount("");
    setCurrencyCode(currencies[0]?.code ?? "");
    setCashWalletId(defaultCashWalletId);
    setNotes("");
    setFieldErrors({});
    setError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await addExternalMoneyAction({
        amount,
        currencyCode,
        cashWalletId: cashWalletId || null,
        notes,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onSuccess?.(result.message);
      router.refresh();
      handleOpenChange(false);
    } catch {
      setError("Unable to add external money. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <HandCoins data-icon="inline-start" />
        Add External Money
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.externalMoney.add}</DialogTitle>
          <DialogDescription>
            Add saraf capital into shop cash (till or vault). This increases
            available cash and records opening equity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="text-destructive text-sm" role="alert">
              {error}
            </div>
          ) : null}

          <FieldGroup>
            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="external-money-amount">{t.common.amount}</FieldLabel>
              <Input
                id="external-money-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                aria-invalid={fieldErrors.amount ? true : undefined}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              {fieldErrors.amount ? (
                <FieldError>{fieldErrors.amount}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={fieldErrors.currencyCode ? true : undefined}>
              <FieldLabel htmlFor="external-money-currency">{t.common.currency}</FieldLabel>
              <select
                id="external-money-currency"
                name="currencyCode"
                className={selectClassName}
                value={currencyCode}
                aria-invalid={fieldErrors.currencyCode ? true : undefined}
                onChange={(event) => setCurrencyCode(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select currency
                </option>
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {fieldErrors.currencyCode ? (
                <FieldError>{fieldErrors.currencyCode}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={fieldErrors.cashWalletId ? true : undefined}>
              <FieldLabel htmlFor="external-money-wallet">
                Cash wallet
              </FieldLabel>
              <select
                id="external-money-wallet"
                name="cashWalletId"
                className={selectClassName}
                value={cashWalletId}
                aria-invalid={fieldErrors.cashWalletId ? true : undefined}
                onChange={(event) => setCashWalletId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select till or vault
                </option>
                {cashWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.label} ({wallet.type === "TILL" ? "Till" : "Vault"})
                  </option>
                ))}
              </select>
              {fieldErrors.cashWalletId ? (
                <FieldError>{fieldErrors.cashWalletId}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={fieldErrors.notes ? true : undefined}>
              <FieldLabel htmlFor="external-money-notes">{t.common.notes}</FieldLabel>
              <Textarea
                id="external-money-notes"
                name="notes"
                rows={3}
                placeholder="Optional note (source, reason…)"
                value={notes}
                aria-invalid={fieldErrors.notes ? true : undefined}
                onChange={(event) => setNotes(event.target.value)}
              />
              {fieldErrors.notes ? (
                <FieldError>{fieldErrors.notes}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || currencies.length === 0}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <HandCoins data-icon="inline-start" />
              )}
              {isSubmitting ? "Posting..." : "Add external money"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
