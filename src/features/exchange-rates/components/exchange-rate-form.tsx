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
import type { ExchangeRateFieldErrors } from "@/features/exchange-rates/actions/exchange-rate-actions";
import type { ExchangeRateCurrencyOption } from "@/features/exchange-rates/domain/types";
import { useT } from "@/lib/i18n";

export type ExchangeRateFormValues = {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: string;
  effectiveDate: string;
  isActive: boolean;
};

function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyExchangeRateFormValues(): ExchangeRateFormValues {
  return {
    baseCurrencyId: "",
    quoteCurrencyId: "",
    rate: "",
    effectiveDate: todayDateInputValue(),
    isActive: true,
  };
}

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type ExchangeRateFormProps = {
  initialValues?: ExchangeRateFormValues;
  currencies: ExchangeRateCurrencyOption[];
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: ExchangeRateFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: ExchangeRateFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function ExchangeRateForm({
  initialValues,
  currencies,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: ExchangeRateFormProps) {
  const t = useT();
  const defaults = useMemo(
    () => initialValues ?? emptyExchangeRateFormValues(),
    [initialValues],
  );
  const [form, setForm] = useState<ExchangeRateFormValues>(defaults);
  const [fieldErrors, setFieldErrors] = useState<ExchangeRateFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseCode =
    currencies.find((currency) => currency.id === form.baseCurrencyId)?.code ??
    "BASE";
  const quoteCode =
    currencies.find((currency) => currency.id === form.quoteCurrencyId)?.code ??
    "QUOTE";
  const previewRate = form.rate.trim() || "…";

  function updateField<K extends keyof ExchangeRateFormValues>(
    key: K,
    value: ExchangeRateFormValues[K],
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
        <Field data-invalid={fieldErrors.baseCurrencyId ? true : undefined}>
          <FieldLabel htmlFor="exchange-rate-base">Base Currency</FieldLabel>
          <select
            id="exchange-rate-base"
            name="baseCurrencyId"
            value={form.baseCurrencyId}
            disabled={disabled}
            aria-invalid={fieldErrors.baseCurrencyId ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("baseCurrencyId", event.target.value)
            }
          >
            <option value="">{t.exchangeRates.baseCurrency}</option>
            {currencies.map((currency) => (
              <option key={currency.id} value={currency.id}>
                {currency.label}
              </option>
            ))}
          </select>
          {fieldErrors.baseCurrencyId ? (
            <FieldError>{fieldErrors.baseCurrencyId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.quoteCurrencyId ? true : undefined}>
          <FieldLabel htmlFor="exchange-rate-quote">Quote Currency</FieldLabel>
          <select
            id="exchange-rate-quote"
            name="quoteCurrencyId"
            value={form.quoteCurrencyId}
            disabled={disabled}
            aria-invalid={fieldErrors.quoteCurrencyId ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("quoteCurrencyId", event.target.value)
            }
          >
            <option value="">{t.exchangeRates.quoteCurrency}</option>
            {currencies.map((currency) => (
              <option key={currency.id} value={currency.id}>
                {currency.label}
              </option>
            ))}
          </select>
          {fieldErrors.quoteCurrencyId ? (
            <FieldError>{fieldErrors.quoteCurrencyId}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.rate ? true : undefined}>
          <FieldLabel htmlFor="exchange-rate-rate">Rate</FieldLabel>
          <Input
            id="exchange-rate-rate"
            name="rate"
            inputMode="decimal"
            placeholder="70"
            value={form.rate}
            disabled={disabled}
            aria-invalid={fieldErrors.rate ? true : undefined}
            onChange={(event) => updateField("rate", event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            1 {baseCode} = {previewRate} {quoteCode}
          </p>
          {fieldErrors.rate ? <FieldError>{fieldErrors.rate}</FieldError> : null}
        </Field>

        <Field data-invalid={fieldErrors.effectiveDate ? true : undefined}>
          <FieldLabel htmlFor="exchange-rate-date">Effective Date</FieldLabel>
          <Input
            id="exchange-rate-date"
            name="effectiveDate"
            type="date"
            value={form.effectiveDate}
            disabled={disabled}
            aria-invalid={fieldErrors.effectiveDate ? true : undefined}
            onChange={(event) =>
              updateField("effectiveDate", event.target.value)
            }
          />
          {fieldErrors.effectiveDate ? (
            <FieldError>{fieldErrors.effectiveDate}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.isActive ? true : undefined}>
          <FieldLabel htmlFor="exchange-rate-status">{t.common.status}</FieldLabel>
          <select
            id="exchange-rate-status"
            name="isActive"
            value={form.isActive ? "active" : "inactive"}
            disabled={disabled}
            aria-invalid={fieldErrors.isActive ? true : undefined}
            className={selectClassName}
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
