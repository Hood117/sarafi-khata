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
import type { CurrencyFieldErrors } from "@/features/currencies/actions/currency-actions";
import { useT } from "@/lib/i18n";

export type CurrencyFormValues = {
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
};

export const emptyCurrencyFormValues: CurrencyFormValues = {
  code: "",
  name: "",
  symbol: "",
  isActive: true,
};

type CurrencyFormProps = {
  initialValues?: CurrencyFormValues;
  /** When true, currency code cannot be edited (update mode). */
  codeReadOnly?: boolean;
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: CurrencyFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: CurrencyFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function CurrencyForm({
  initialValues = emptyCurrencyFormValues,
  codeReadOnly = false,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: CurrencyFormProps) {
  const t = useT();
  const [form, setForm] = useState<CurrencyFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<CurrencyFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof CurrencyFormValues>(
    key: K,
    value: CurrencyFormValues[K],
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
        <Field data-invalid={fieldErrors.code ? true : undefined}>
          <FieldLabel htmlFor="currency-code">Code</FieldLabel>
          <Input
            id="currency-code"
            name="code"
            placeholder="USD"
            value={form.code}
            disabled={disabled || codeReadOnly}
            readOnly={codeReadOnly}
            aria-invalid={fieldErrors.code ? true : undefined}
            onChange={(event) =>
              updateField("code", event.target.value.toUpperCase())
            }
          />
          {fieldErrors.code ? (
            <FieldError>{fieldErrors.code}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.name ? true : undefined}>
          <FieldLabel htmlFor="currency-name">{t.common.name}</FieldLabel>
          <Input
            id="currency-name"
            name="name"
            placeholder="US Dollar"
            value={form.name}
            disabled={disabled}
            aria-invalid={fieldErrors.name ? true : undefined}
            onChange={(event) => updateField("name", event.target.value)}
          />
          {fieldErrors.name ? (
            <FieldError>{fieldErrors.name}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.symbol ? true : undefined}>
          <FieldLabel htmlFor="currency-symbol">Symbol</FieldLabel>
          <Input
            id="currency-symbol"
            name="symbol"
            placeholder="$"
            value={form.symbol}
            disabled={disabled}
            aria-invalid={fieldErrors.symbol ? true : undefined}
            onChange={(event) => updateField("symbol", event.target.value)}
          />
          {fieldErrors.symbol ? (
            <FieldError>{fieldErrors.symbol}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.isActive ? true : undefined}>
          <FieldLabel htmlFor="currency-isActive">{t.common.status}</FieldLabel>
          <select
            id="currency-isActive"
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
