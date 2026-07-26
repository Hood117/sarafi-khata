"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { WalletType } from "@/generated/prisma/client";
import type { WalletFieldErrors } from "@/features/wallets/actions/wallet-actions";
import type { WalletCustomerOption } from "@/features/wallets/domain/types";

export type WalletFormValues = {
  name: string;
  type: WalletType;
  customerId: string;
};

export const emptyWalletFormValues: WalletFormValues = {
  name: "",
  type: "CUSTOMER",
  customerId: "",
};

const WALLET_TYPE_OPTIONS: { value: WalletType; label: string }[] = [
  { value: "VAULT", label: "Vault" },
  { value: "TILL", label: "Till" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "SYSTEM", label: "System" },
];

type WalletFormProps = {
  initialValues?: WalletFormValues;
  customerOptions: WalletCustomerOption[];
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: WalletFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: WalletFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function WalletForm({
  initialValues = emptyWalletFormValues,
  customerOptions,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: WalletFormProps) {
  const [form, setForm] = useState<WalletFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<WalletFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof WalletFormValues>(
    key: K,
    value: WalletFormValues[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "type" && value !== "CUSTOMER") {
        next.customerId = "";
      }
      return next;
    });
    setFieldErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "type" ? { customerId: undefined } : {}),
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
      const result = await onSubmit(form);

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
  const showCustomerField = form.type === "CUSTOMER";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={fieldErrors.name ? true : undefined}>
          <FieldLabel htmlFor="wallet-name">Wallet Name</FieldLabel>
          <Input
            id="wallet-name"
            name="name"
            placeholder="Wallet name"
            value={form.name}
            disabled={disabled}
            aria-invalid={fieldErrors.name ? true : undefined}
            onChange={(event) => updateField("name", event.target.value)}
          />
          {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={fieldErrors.type ? true : undefined}>
          <FieldLabel htmlFor="wallet-type">Wallet Type</FieldLabel>
          <select
            id="wallet-type"
            name="type"
            value={form.type}
            disabled={disabled}
            aria-invalid={fieldErrors.type ? true : undefined}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) =>
              updateField("type", event.target.value as WalletType)
            }
          >
            {WALLET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.type ? <FieldError>{fieldErrors.type}</FieldError> : null}
        </Field>

        {showCustomerField ? (
          <Field data-invalid={fieldErrors.customerId ? true : undefined}>
            <FieldLabel htmlFor="wallet-customerId">Customer</FieldLabel>
            <select
              id="wallet-customerId"
              name="customerId"
              value={form.customerId}
              disabled={disabled}
              aria-invalid={fieldErrors.customerId ? true : undefined}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) =>
                updateField("customerId", event.target.value)
              }
            >
              <option value="">Select a customer</option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
            {fieldErrors.customerId ? (
              <FieldError>{fieldErrors.customerId}</FieldError>
            ) : null}
          </Field>
        ) : null}
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
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
