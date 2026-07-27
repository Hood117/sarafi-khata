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
import type { UserFieldErrors } from "@/features/users/actions/user-actions";

export type ResetPasswordFormValues = {
  password: string;
  confirmPassword: string;
};

export const emptyResetPasswordFormValues: ResetPasswordFormValues = {
  password: "",
  confirmPassword: "",
};

type ResetPasswordFormProps = {
  submitLabel?: string;
  errorFallbackMessage: string;
  onCancel: () => void;
  onSubmit: (
    values: ResetPasswordFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: UserFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function ResetPasswordForm({
  submitLabel = "Reset Password",
  errorFallbackMessage,
  onCancel,
  onSubmit,
  onSuccess,
}: ResetPasswordFormProps) {
  const [form, setForm] = useState<ResetPasswordFormValues>(
    emptyResetPasswordFormValues,
  );
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof ResetPasswordFormValues>(
    key: K,
    value: ResetPasswordFormValues[K],
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

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={fieldErrors.password ? true : undefined}>
          <FieldLabel htmlFor="reset-password">New password</FieldLabel>
          <Input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.password ? true : undefined}
            onChange={(event) => updateField("password", event.target.value)}
          />
          {fieldErrors.password ? (
            <FieldError>{fieldErrors.password}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.confirmPassword ? true : undefined}>
          <FieldLabel htmlFor="reset-confirmPassword">
            Confirm new password
          </FieldLabel>
          <Input
            id="reset-confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.confirmPassword ? true : undefined}
            onChange={(event) =>
              updateField("confirmPassword", event.target.value)
            }
          />
          {fieldErrors.confirmPassword ? (
            <FieldError>{fieldErrors.confirmPassword}</FieldError>
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
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
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
