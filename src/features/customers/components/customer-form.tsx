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

export type CustomerFormValues = {
  fullName: string;
  phone: string;
  address: string;
  nationalId: string;
  notes: string;
};

export const emptyCustomerFormValues: CustomerFormValues = {
  fullName: "",
  phone: "",
  address: "",
  nationalId: "",
  notes: "",
};

type CustomerFormProps = {
  initialValues?: CustomerFormValues;
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
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: CustomerFormProps) {
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
        <Field data-invalid={fieldErrors.fullName ? true : undefined}>
          <FieldLabel htmlFor="customer-fullName">Name</FieldLabel>
          <Input
            id="customer-fullName"
            name="fullName"
            autoComplete="name"
            placeholder="Full name"
            value={form.fullName}
            disabled={disabled}
            aria-invalid={fieldErrors.fullName ? true : undefined}
            onChange={(event) => updateField("fullName", event.target.value)}
          />
          {fieldErrors.fullName ? (
            <FieldError>{fieldErrors.fullName}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.phone ? true : undefined}>
          <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
          <Input
            id="customer-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="Phone number"
            value={form.phone}
            disabled={disabled}
            aria-invalid={fieldErrors.phone ? true : undefined}
            onChange={(event) => updateField("phone", event.target.value)}
          />
          {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
        </Field>

        <Field data-invalid={fieldErrors.address ? true : undefined}>
          <FieldLabel htmlFor="customer-address">Address</FieldLabel>
          <Input
            id="customer-address"
            name="address"
            autoComplete="street-address"
            placeholder="Address (optional)"
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
          <FieldLabel htmlFor="customer-nationalId">National ID</FieldLabel>
          <Input
            id="customer-nationalId"
            name="nationalId"
            placeholder="National ID (optional)"
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
          <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
          <Textarea
            id="customer-notes"
            name="notes"
            placeholder="Notes (optional)"
            value={form.notes}
            disabled={disabled}
            aria-invalid={fieldErrors.notes ? true : undefined}
            onChange={(event) => updateField("notes", event.target.value)}
          />
          {fieldErrors.notes ? <FieldError>{fieldErrors.notes}</FieldError> : null}
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
