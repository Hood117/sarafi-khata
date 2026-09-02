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
import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";
import type { PartnerSarafiFieldErrors } from "@/features/partner-sarafi/actions/partner-sarafi-actions";

export type PartnerCustomerOption = {
  id: string;
  label: string;
  fullName: string;
  phone: string | null;
};

export type PartnerSarafiFormValues = {
  customerId: string;
  name: string;
  phone: string;
  city: string;
  country: string;
  notes: string;
  isActive: boolean;
  commissionEnabled: boolean;
  commissionPerAmount: string;
  commissionFeeAmount: string;
  commissionCurrencyCode: string;
};

export const emptyPartnerSarafiFormValues: PartnerSarafiFormValues = {
  customerId: "",
  name: "",
  phone: "",
  city: "",
  country: "",
  isActive: true,
  notes: "",
  commissionEnabled: false,
  commissionPerAmount: "100000",
  commissionFeeAmount: "100",
  commissionCurrencyCode: "AFN",
};

export type PartnerCurrencyOption = {
  code: string;
  label: string;
};

type PartnerSarafiFormProps = {
  initialValues?: PartnerSarafiFormValues;
  customerOptions: PartnerCustomerOption[];
  currencyOptions: PartnerCurrencyOption[];
  requireCustomer?: boolean;
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: PartnerSarafiFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: PartnerSarafiFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function PartnerSarafiForm({
  initialValues = emptyPartnerSarafiFormValues,
  customerOptions,
  currencyOptions,
  requireCustomer = false,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: PartnerSarafiFormProps) {
  const t = useT();
  const [form, setForm] = useState<PartnerSarafiFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<PartnerSarafiFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof PartnerSarafiFormValues>(
    key: K,
    value: PartnerSarafiFormValues[K],
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
  const customerLocked = Boolean(initialValues.customerId);
  const customerMissingFromOptions =
    Boolean(form.customerId) &&
    !customerOptions.some((option) => option.id === form.customerId);
  const exampleFee =
    form.commissionEnabled &&
    Number(form.commissionPerAmount) > 0 &&
    Number(form.commissionFeeAmount) > 0
      ? (
          (200000 * Number(form.commissionFeeAmount)) /
          Number(form.commissionPerAmount)
        ).toFixed(0)
      : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={fieldErrors.customerId ? true : undefined}>
          <FieldLabel htmlFor="partner-customer">{t.partner.selectCustomer}</FieldLabel>
          <select
            id="partner-customer"
            name="customerId"
            value={form.customerId}
            required={requireCustomer}
            disabled={disabled || customerLocked}
            aria-invalid={fieldErrors.customerId ? true : undefined}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => {
              const nextId = event.target.value;
              const selected = customerOptions.find((c) => c.id === nextId);
              updateField("customerId", nextId);
              if (selected) {
                updateField("name", selected.fullName);
                updateField("phone", selected.phone ?? "");
              }
            }}
          >
            <option value="">{t.partner.searchCustomers}</option>
            {customerMissingFromOptions ? (
              <option value={form.customerId}>{form.name}</option>
            ) : null}
            {customerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.phone ? ` · ${option.phone}` : ""}
              </option>
            ))}
          </select>
          {customerLocked ? (
            <p className="text-muted-foreground text-xs">
              {t.partner.customerLinkedHint}
            </p>
          ) : null}
          {fieldErrors.customerId ? (
            <FieldError>{fieldErrors.customerId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.name ? true : undefined}>
          <FieldLabel htmlFor="partner-name">{t.common.name}</FieldLabel>
          <Input
            id="partner-name"
            name="name"
            placeholder={t.common.name}
            value={form.name}
            disabled={disabled || Boolean(form.customerId)}
            readOnly={Boolean(form.customerId)}
            aria-invalid={fieldErrors.name ? true : undefined}
            onChange={(event) => updateField("name", event.target.value)}
          />
          {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={fieldErrors.phone ? true : undefined}>
          <FieldLabel htmlFor="partner-phone">{t.common.phone}</FieldLabel>
          <Input
            id="partner-phone"
            name="phone"
            type="tel"
            value={form.phone}
            disabled={disabled || Boolean(form.customerId)}
            readOnly={Boolean(form.customerId)}
            aria-invalid={fieldErrors.phone ? true : undefined}
            onChange={(event) => updateField("phone", event.target.value)}
          />
          {fieldErrors.phone ? (
            <FieldError>{fieldErrors.phone}</FieldError>
          ) : null}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={fieldErrors.city ? true : undefined}>
            <FieldLabel htmlFor="partner-city">{t.common.city}</FieldLabel>
            <Input
              id="partner-city"
              name="city"
              value={form.city}
              disabled={disabled}
              aria-invalid={fieldErrors.city ? true : undefined}
              onChange={(event) => updateField("city", event.target.value)}
            />
            {fieldErrors.city ? (
              <FieldError>{fieldErrors.city}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={fieldErrors.country ? true : undefined}>
            <FieldLabel htmlFor="partner-country">{t.common.country}</FieldLabel>
            <Input
              id="partner-country"
              name="country"
              value={form.country}
              disabled={disabled}
              aria-invalid={fieldErrors.country ? true : undefined}
              onChange={(event) => updateField("country", event.target.value)}
            />
            {fieldErrors.country ? (
              <FieldError>{fieldErrors.country}</FieldError>
            ) : null}
          </Field>
        </div>

        <Field data-invalid={fieldErrors.notes ? true : undefined}>
          <FieldLabel htmlFor="partner-notes">{t.common.notes}</FieldLabel>
          <Textarea
            id="partner-notes"
            name="notes"
            value={form.notes}
            disabled={disabled}
            aria-invalid={fieldErrors.notes ? true : undefined}
            onChange={(event) => updateField("notes", event.target.value)}
          />
          {fieldErrors.notes ? (
            <FieldError>{fieldErrors.notes}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.isActive ? true : undefined}>
          <FieldLabel htmlFor="partner-isActive">{t.common.status}</FieldLabel>
          <select
            id="partner-isActive"
            name="isActive"
            value={form.isActive ? "active" : "inactive"}
            disabled={disabled}
            aria-invalid={fieldErrors.isActive ? true : undefined}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) =>
              updateField("isActive", event.target.value === "active")
            }
          >
            <option value="active">{t.common.active}</option>
            <option value="inactive">{t.common.inactive}</option>
          </select>
          {fieldErrors.isActive ? (
            <FieldError>{fieldErrors.isActive}</FieldError>
          ) : null}
        </Field>

        <div className="bg-muted/40 space-y-3 rounded-xl p-3 ring-1 ring-foreground/10">
          <div className="space-y-1">
            <Typography variant="h4" className="text-sm font-semibold">
              {t.partner.commissionOnHawala}
            </Typography>
            <Typography variant="muted" className="text-xs">
              {t.hawala.commissionHint}
            </Typography>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.commissionEnabled}
              disabled={disabled}
              onChange={(event) =>
                updateField("commissionEnabled", event.target.checked)
              }
            />
            {t.partner.commission}
          </label>

          {form.commissionEnabled ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                data-invalid={
                  fieldErrors.commissionPerAmount ? true : undefined
                }
              >
                <FieldLabel htmlFor="partner-comm-per">
                  {t.hawala.commissionPer}
                </FieldLabel>
                <Input
                  id="partner-comm-per"
                  inputMode="decimal"
                  placeholder={t.hawala.perExample}
                  value={form.commissionPerAmount}
                  disabled={disabled}
                  aria-invalid={
                    fieldErrors.commissionPerAmount ? true : undefined
                  }
                  onChange={(event) =>
                    updateField("commissionPerAmount", event.target.value)
                  }
                />
                {fieldErrors.commissionPerAmount ? (
                  <FieldError>{fieldErrors.commissionPerAmount}</FieldError>
                ) : null}
              </Field>

              <Field
                data-invalid={
                  fieldErrors.commissionFeeAmount ? true : undefined
                }
              >
                <FieldLabel htmlFor="partner-comm-fee">
                  {t.hawala.commissionFee}
                </FieldLabel>
                <Input
                  id="partner-comm-fee"
                  inputMode="decimal"
                  placeholder={t.hawala.feeExample}
                  value={form.commissionFeeAmount}
                  disabled={disabled}
                  aria-invalid={
                    fieldErrors.commissionFeeAmount ? true : undefined
                  }
                  onChange={(event) =>
                    updateField("commissionFeeAmount", event.target.value)
                  }
                />
                {fieldErrors.commissionFeeAmount ? (
                  <FieldError>{fieldErrors.commissionFeeAmount}</FieldError>
                ) : null}
              </Field>

              <Field
                data-invalid={
                  fieldErrors.commissionCurrencyCode ? true : undefined
                }
              >
                <FieldLabel htmlFor="partner-comm-currency">{t.common.currency}</FieldLabel>
                <select
                  id="partner-comm-currency"
                  value={form.commissionCurrencyCode}
                  disabled={disabled}
                  aria-invalid={
                    fieldErrors.commissionCurrencyCode ? true : undefined
                  }
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(event) =>
                    updateField("commissionCurrencyCode", event.target.value)
                  }
                >
                  <option value="">{t.common.select}</option>
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.commissionCurrencyCode ? (
                  <FieldError>{fieldErrors.commissionCurrencyCode}</FieldError>
                ) : null}
              </Field>
            </div>
          ) : null}

          {form.commissionEnabled && exampleFee ? (
            <Typography variant="muted" className="text-xs">
              {t.hawala.commissionAppliesHint} {exampleFee}{" "}
              {form.commissionCurrencyCode || "AFN"}.
            </Typography>
          ) : null}
        </div>
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
