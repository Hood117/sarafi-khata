"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  TransactionCurrencyOption,
  TransactionCustomerOption,
  TransactionFormType,
  TransactionWalletOption,
} from "@/features/transactions/domain/types";
import {
  toTransactionFormFieldErrors,
  transactionFormSchema,
  type TransactionFormFieldErrors,
} from "@/features/transactions/schemas/transaction-form";

export type TransactionFormValues = {
  type: TransactionFormType;
  customerId: string;
  walletId: string;
  offsetWalletId: string;
  currencyCode: string;
  amount: string;
  reference: string;
  notes: string;
};

export const emptyTransactionFormValues: TransactionFormValues = {
  type: "DEPOSIT",
  customerId: "",
  walletId: "",
  offsetWalletId: "",
  currencyCode: "",
  amount: "",
  reference: "",
  notes: "",
};

const TYPE_OPTIONS: { value: TransactionFormType; label: string }[] = [
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "ADJUSTMENT", label: "Manual Adjustment" },
];

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type TransactionFormProps = {
  customers: TransactionCustomerOption[];
  wallets: TransactionWalletOption[];
  currencies: TransactionCurrencyOption[];
  initialValues?: TransactionFormValues;
  submitLabel?: string;
  errorFallbackMessage?: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: TransactionFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: TransactionFormFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function TransactionForm({
  customers,
  wallets,
  currencies,
  initialValues = emptyTransactionFormValues,
  submitLabel = "Post Transaction",
  errorFallbackMessage = "Unable to post transaction. Please try again.",
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: TransactionFormProps) {
  const [form, setForm] = useState<TransactionFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<TransactionFormFieldErrors>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdjustment = form.type === "ADJUSTMENT";

  const walletOptions = useMemo(() => {
    if (isAdjustment) {
      return wallets;
    }

    return wallets.filter(
      (wallet) =>
        wallet.type === "CUSTOMER" &&
        (!form.customerId || wallet.customerId === form.customerId),
    );
  }, [form.customerId, isAdjustment, wallets]);

  const offsetWalletOptions = useMemo(() => {
    if (isAdjustment) {
      return wallets.filter((wallet) => wallet.id !== form.walletId);
    }

    return wallets.filter(
      (wallet) =>
        (wallet.type === "VAULT" || wallet.type === "TILL") &&
        wallet.id !== form.walletId,
    );
  }, [form.walletId, isAdjustment, wallets]);

  const offsetWalletLabel = isAdjustment ? "Credit Wallet" : "Cash Wallet";

  const walletPlaceholder = !isAdjustment && !form.customerId
    ? "Select a customer first"
    : walletOptions.length === 0
      ? "No wallets available"
      : "Select a wallet";

  function customerWalletsFor(customerId: string): TransactionWalletOption[] {
    return wallets.filter(
      (wallet) =>
        wallet.type === "CUSTOMER" && wallet.customerId === customerId,
    );
  }

  function updateField<K extends keyof TransactionFormValues>(
    key: K,
    value: TransactionFormValues[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "type") {
        next.walletId = "";
        next.offsetWalletId = "";
        if (value === "ADJUSTMENT") {
          // customer optional for adjustments
        } else if (!next.customerId) {
          next.customerId = "";
        } else {
          const options = customerWalletsFor(next.customerId);
          next.walletId = options.length === 1 ? options[0].id : "";
        }
      }

      if (key === "customerId" && next.type !== "ADJUSTMENT") {
        const options =
          typeof value === "string" && value
            ? customerWalletsFor(value)
            : [];
        next.walletId = options.length === 1 ? options[0].id : "";
      }

      if (key === "walletId" && next.offsetWalletId === value) {
        next.offsetWalletId = "";
      }

      return next;
    });

    setFieldErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "type" || key === "customerId"
        ? { walletId: undefined, offsetWalletId: undefined }
        : {}),
      ...(key === "walletId" ? { offsetWalletId: undefined } : {}),
    }));
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const parsed = transactionFormSchema.safeParse(form);

      if (!parsed.success) {
        setFieldErrors(toTransactionFormFieldErrors(parsed.error));
        setFormError("Please correct the highlighted fields.");
        return;
      }

      const result = await onSubmit({
        type: parsed.data.type,
        customerId: parsed.data.customerId,
        walletId: parsed.data.walletId,
        offsetWalletId: parsed.data.offsetWalletId,
        currencyCode: parsed.data.currencyCode,
        amount: parsed.data.amount,
        reference: parsed.data.reference,
        notes: parsed.data.notes ?? "",
      });

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.message);
        return;
      }

      setSuccessMessage(result.message);
      onSuccess?.(result.message);
    } catch {
      setFormError(errorFallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isBusy || isSubmitting;
  const walletSelectEnabled =
    !disabled && (isAdjustment || Boolean(form.customerId));

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={fieldErrors.type ? true : undefined}>
          <FieldLabel htmlFor="transaction-type">Transaction Type</FieldLabel>
          <select
            id="transaction-type"
            name="type"
            value={form.type}
            disabled={disabled}
            aria-invalid={fieldErrors.type ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("type", event.target.value as TransactionFormType)
            }
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.type ? (
            <FieldError>{fieldErrors.type}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.customerId ? true : undefined}>
          <FieldLabel htmlFor="transaction-customerId">Customer</FieldLabel>
          <select
            id="transaction-customerId"
            name="customerId"
            value={form.customerId}
            disabled={disabled}
            aria-invalid={fieldErrors.customerId ? true : undefined}
            className={selectClassName}
            onChange={(event) => updateField("customerId", event.target.value)}
          >
            <option value="">
              {isAdjustment ? "No customer (optional)" : "Select a customer"}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
          {fieldErrors.customerId ? (
            <FieldError>{fieldErrors.customerId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.walletId ? true : undefined}>
          <FieldLabel htmlFor="transaction-walletId">
            {isAdjustment ? "Debit Wallet" : "Wallet"}
          </FieldLabel>
          <Select
            value={form.walletId || null}
            onValueChange={(value) =>
              updateField("walletId", typeof value === "string" ? value : "")
            }
            disabled={!walletSelectEnabled || walletOptions.length === 0}
          >
            <SelectTrigger
              id="transaction-walletId"
              size="default"
              className="w-full min-w-0"
              aria-invalid={fieldErrors.walletId ? true : undefined}
            >
              <SelectValue placeholder={walletPlaceholder} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom" align="start">
              {walletOptions.map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdjustment && form.customerId && walletOptions.length === 0 ? (
            <FieldError>
              This customer has no wallets. Create a Customer wallet on the
              Wallets page, then try again.
            </FieldError>
          ) : null}
          {fieldErrors.walletId ? (
            <FieldError>{fieldErrors.walletId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.offsetWalletId ? true : undefined}>
          <FieldLabel htmlFor="transaction-offsetWalletId">
            {offsetWalletLabel}
          </FieldLabel>
          <select
            id="transaction-offsetWalletId"
            name="offsetWalletId"
            value={form.offsetWalletId}
            disabled={disabled}
            aria-invalid={fieldErrors.offsetWalletId ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("offsetWalletId", event.target.value)
            }
          >
            <option value="">Select {offsetWalletLabel.toLowerCase()}</option>
            {offsetWalletOptions.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.label}
              </option>
            ))}
          </select>
          {fieldErrors.offsetWalletId ? (
            <FieldError>{fieldErrors.offsetWalletId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.currencyCode ? true : undefined}>
          <FieldLabel htmlFor="transaction-currencyCode">Currency</FieldLabel>
          <select
            id="transaction-currencyCode"
            name="currencyCode"
            value={form.currencyCode}
            disabled={disabled}
            aria-invalid={fieldErrors.currencyCode ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("currencyCode", event.target.value)
            }
          >
            <option value="">Select a currency</option>
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

        <Field data-invalid={fieldErrors.amount ? true : undefined}>
          <FieldLabel htmlFor="transaction-amount">Amount</FieldLabel>
          <Input
            id="transaction-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={form.amount}
            disabled={disabled}
            aria-invalid={fieldErrors.amount ? true : undefined}
            onChange={(event) => updateField("amount", event.target.value)}
          />
          {fieldErrors.amount ? (
            <FieldError>{fieldErrors.amount}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.reference ? true : undefined}>
          <FieldLabel htmlFor="transaction-reference">Reference</FieldLabel>
          <Input
            id="transaction-reference"
            name="reference"
            placeholder="Reference number"
            value={form.reference}
            disabled={disabled}
            aria-invalid={fieldErrors.reference ? true : undefined}
            onChange={(event) => updateField("reference", event.target.value)}
          />
          {fieldErrors.reference ? (
            <FieldError>{fieldErrors.reference}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.notes ? true : undefined}>
          <FieldLabel htmlFor="transaction-notes">Notes</FieldLabel>
          <Textarea
            id="transaction-notes"
            name="notes"
            placeholder="Optional notes"
            value={form.notes}
            disabled={disabled}
            aria-invalid={fieldErrors.notes ? true : undefined}
            onChange={(event) => updateField("notes", event.target.value)}
          />
          {fieldErrors.notes ? (
            <FieldError>{fieldErrors.notes}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      {successMessage ? (
        <p className="text-success text-sm" role="status">
          {successMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Posting...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
