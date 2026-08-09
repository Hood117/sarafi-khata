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
import { Textarea } from "@/components/ui/textarea";
import type { CreateCustomerFieldErrors } from "@/features/customers/schemas/create-customer";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type CurrencyOption = {
  code: string;
  name: string;
};

export type CustomerFormValues = {
  fullName: string;
  fatherName: string;
  phone: string;
  address: string;
  nationalId: string;
  notes: string;
  openingBalanceAmount: string;
  openingBalanceCurrencyCode: string;
};

export const emptyCustomerFormValues: CustomerFormValues = {
  fullName: "",
  fatherName: "",
  phone: "",
  address: "",
  nationalId: "",
  notes: "",
  openingBalanceAmount: "",
  openingBalanceCurrencyCode: "",
};

type CustomerFormProps = {
  initialValues?: CustomerFormValues;
  /** When true, shows opening balance fields (create only). */
  showOpeningBalance?: boolean;
  currencyOptions?: CurrencyOption[];
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: CustomerFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: CreateCustomerFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function CustomerForm({
  initialValues = emptyCustomerFormValues,
  showOpeningBalance = false,
  currencyOptions = [],
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: CustomerFormProps) {
  const t = useT();
  const [form, setForm] = useState<CustomerFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<CreateCustomerFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
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

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={fieldErrors.fullName ? true : undefined}>
            <FieldLabel htmlFor="customer-fullName">
              {t.customers.fullName}
            </FieldLabel>
            <Input
              id="customer-fullName"
              name="fullName"
              autoComplete="name"
              placeholder={t.customers.fullName}
              value={form.fullName}
              disabled={disabled}
              aria-invalid={fieldErrors.fullName ? true : undefined}
              onChange={(event) => updateField("fullName", event.target.value)}
            />
            {fieldErrors.fullName ? (
              <FieldError>{fieldErrors.fullName}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={fieldErrors.fatherName ? true : undefined}>
            <FieldLabel htmlFor="customer-fatherName">
              {t.customers.fatherName}
            </FieldLabel>
            <Input
              id="customer-fatherName"
              name="fatherName"
              placeholder={t.customers.fatherName}
              value={form.fatherName}
              disabled={disabled}
              aria-invalid={fieldErrors.fatherName ? true : undefined}
              onChange={(event) =>
                updateField("fatherName", event.target.value)
              }
            />
            {fieldErrors.fatherName ? (
              <FieldError>{fieldErrors.fatherName}</FieldError>
            ) : null}
          </Field>
        </div>

        <Field data-invalid={fieldErrors.phone ? true : undefined}>
          <FieldLabel htmlFor="customer-phone">{t.common.phone}</FieldLabel>
          <Input
            id="customer-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder={t.common.phone}
            value={form.phone}
            disabled={disabled}
            aria-invalid={fieldErrors.phone ? true : undefined}
            onChange={(event) => updateField("phone", event.target.value)}
          />
          {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
        </Field>

        <Field data-invalid={fieldErrors.address ? true : undefined}>
          <FieldLabel htmlFor="customer-address">{t.common.address}</FieldLabel>
          <Input
            id="customer-address"
            name="address"
            autoComplete="street-address"
            placeholder={t.common.optional}
            value={form.address}
            disabled={disabled}
            aria-invalid={fieldErrors.address ? true : undefined}
            onChange={(event) => updateField("address", event.target.value)}
          />
          {fieldErrors.address ? (
            <FieldError>{fieldErrors.address}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.nationalId ? true : undefined}>
          <FieldLabel htmlFor="customer-nationalId">
            {t.customers.idNumber}
          </FieldLabel>
          <Input
            id="customer-nationalId"
            name="nationalId"
            placeholder={t.common.optional}
            value={form.nationalId}
            disabled={disabled}
            aria-invalid={fieldErrors.nationalId ? true : undefined}
            onChange={(event) => updateField("nationalId", event.target.value)}
          />
          {fieldErrors.nationalId ? (
            <FieldError>{fieldErrors.nationalId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.notes ? true : undefined}>
          <FieldLabel htmlFor="customer-notes">{t.common.notes}</FieldLabel>
          <Textarea
            id="customer-notes"
            name="notes"
            placeholder={t.common.notesOptional}
            value={form.notes}
            disabled={disabled}
            aria-invalid={fieldErrors.notes ? true : undefined}
            onChange={(event) => updateField("notes", event.target.value)}
          />
          {fieldErrors.notes ? <FieldError>{fieldErrors.notes}</FieldError> : null}
        </Field>

        {showOpeningBalance ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              data-invalid={
                fieldErrors.openingBalanceAmount ? true : undefined
              }
            >
              <FieldLabel htmlFor="customer-openingBalanceAmount">
                {t.customers.openingWallet}
              </FieldLabel>
              <Input
                id="customer-openingBalanceAmount"
                name="openingBalanceAmount"
                inputMode="decimal"
                placeholder={t.common.amountPlaceholder}
                value={form.openingBalanceAmount}
                disabled={disabled}
                aria-invalid={
                  fieldErrors.openingBalanceAmount ? true : undefined
                }
                onChange={(event) =>
                  updateField("openingBalanceAmount", event.target.value)
                }
              />
              {fieldErrors.openingBalanceAmount ? (
                <FieldError>{fieldErrors.openingBalanceAmount}</FieldError>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t.common.optional}
                </p>
              )}
            </Field>

            <Field
              data-invalid={
                fieldErrors.openingBalanceCurrencyCode ? true : undefined
              }
            >
              <FieldLabel htmlFor="customer-openingBalanceCurrencyCode">
                {t.common.currency}
              </FieldLabel>
              <select
                id="customer-openingBalanceCurrencyCode"
                name="openingBalanceCurrencyCode"
                value={form.openingBalanceCurrencyCode}
                disabled={disabled}
                aria-invalid={
                  fieldErrors.openingBalanceCurrencyCode ? true : undefined
                }
                className={selectClassName}
                onChange={(event) =>
                  updateField(
                    "openingBalanceCurrencyCode",
                    event.target.value,
                  )
                }
              >
                <option value="">{t.hawala.selectCurrency}</option>
                {currencyOptions.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
              {fieldErrors.openingBalanceCurrencyCode ? (
                <FieldError>
                  {fieldErrors.openingBalanceCurrencyCode}
                </FieldError>
              ) : null}
            </Field>
          </div>
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
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              {t.common.loading}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
