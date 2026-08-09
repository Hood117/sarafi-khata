"use client";

import { Loader2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { addCustomerWalletMoneyAction } from "@/features/customers/actions/customer-actions";
import type { CurrencyOption } from "@/features/customers/components/customer-form";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type AddWalletMoneyDialogProps = {
  customerId: string;
  customerName: string;
  currencyOptions: CurrencyOption[];
};

export function AddWalletMoneyDialog({
  customerId,
  customerName,
  currencyOptions,
}: AddWalletMoneyDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(
    currencyOptions[0]?.code ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string;
    currencyCode?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAmount("");
      setCurrencyCode(currencyOptions[0]?.code ?? "");
      setFieldErrors({});
      setError(null);
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await addCustomerWalletMoneyAction({
        customerId,
        amount,
        currencyCode,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors({
          amount: result.fieldErrors?.amount,
          currencyCode: result.fieldErrors?.currencyCode,
        });
        return;
      }

      handleOpenChange(false);
      router.refresh();
    } catch {
      setError("Unable to add wallet money. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Wallet data-icon="inline-start" />
        Add wallet money
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.customers.addWalletMoney}</DialogTitle>
          <DialogDescription>
            Record money {customerName} gives to Saraf. This increases their
            wallet balance and shop cash.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FieldGroup>
            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="wallet-money-amount">{t.common.amount}</FieldLabel>
              <Input
                id="wallet-money-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.amount ? true : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
              {fieldErrors.amount ? (
                <FieldError>{fieldErrors.amount}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={fieldErrors.currencyCode ? true : undefined}>
              <FieldLabel htmlFor="wallet-money-currency">{t.common.currency}</FieldLabel>
              <select
                id="wallet-money-currency"
                name="currencyCode"
                value={currencyCode}
                disabled={isSubmitting || currencyOptions.length === 0}
                aria-invalid={fieldErrors.currencyCode ? true : undefined}
                className={selectClassName}
                onChange={(event) => setCurrencyCode(event.target.value)}
              >
                {currencyOptions.length === 0 ? (
                  <option value="">{t.customers.noCurrencies}</option>
                ) : (
                  currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.currencyCode ? (
                <FieldError>{fieldErrors.currencyCode}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t.common.loading}
                </>
              ) : (
                t.customers.addMoney
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
