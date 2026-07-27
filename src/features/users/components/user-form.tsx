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
import { formatRole } from "@/features/users/domain/format-role";
import { USER_ROLES, type UserRoleOption } from "@/features/users/domain/types";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type UserFormValues = {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: UserRoleOption;
  isActive: boolean;
};

export const emptyUserFormValues: UserFormValues = {
  fullName: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "CASHIER",
  isActive: true,
};

type UserFormProps = {
  initialValues?: UserFormValues;
  /** Create mode shows password fields; edit mode hides them. */
  mode: "create" | "edit";
  /** When true, username cannot be edited. */
  usernameReadOnly?: boolean;
  /** When true, role select is disabled (e.g. editing yourself). */
  roleDisabled?: boolean;
  /** When true, status select is disabled (e.g. editing yourself). */
  statusDisabled?: boolean;
  submitLabel: string;
  errorFallbackMessage: string;
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: UserFormValues,
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

export function UserForm({
  initialValues = emptyUserFormValues,
  mode,
  usernameReadOnly = false,
  roleDisabled = false,
  statusDisabled = false,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: UserFormProps) {
  const [form, setForm] = useState<UserFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof UserFormValues>(
    key: K,
    value: UserFormValues[K],
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
          <FieldLabel htmlFor="user-fullName">Full name</FieldLabel>
          <Input
            id="user-fullName"
            name="fullName"
            placeholder="Ahmad Rahimi"
            value={form.fullName}
            disabled={disabled}
            aria-invalid={fieldErrors.fullName ? true : undefined}
            onChange={(event) => updateField("fullName", event.target.value)}
          />
          {fieldErrors.fullName ? (
            <FieldError>{fieldErrors.fullName}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.username ? true : undefined}>
          <FieldLabel htmlFor="user-username">Username</FieldLabel>
          <Input
            id="user-username"
            name="username"
            autoComplete="off"
            placeholder="ahmad"
            value={form.username}
            disabled={disabled || usernameReadOnly}
            readOnly={usernameReadOnly}
            aria-invalid={fieldErrors.username ? true : undefined}
            onChange={(event) =>
              updateField("username", event.target.value.toLowerCase())
            }
          />
          {fieldErrors.username ? (
            <FieldError>{fieldErrors.username}</FieldError>
          ) : null}
        </Field>

        {mode === "create" ? (
          <>
            <Field data-invalid={fieldErrors.password ? true : undefined}>
              <FieldLabel htmlFor="user-password">Password</FieldLabel>
              <Input
                id="user-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                disabled={disabled}
                aria-invalid={fieldErrors.password ? true : undefined}
                onChange={(event) => updateField("password", event.target.value)}
              />
              {fieldErrors.password ? (
                <FieldError>{fieldErrors.password}</FieldError>
              ) : null}
            </Field>

            <Field
              data-invalid={fieldErrors.confirmPassword ? true : undefined}
            >
              <FieldLabel htmlFor="user-confirmPassword">
                Confirm password
              </FieldLabel>
              <Input
                id="user-confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                disabled={disabled}
                aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                onChange={(event) =>
                  updateField("confirmPassword", event.target.value)
                }
              />
              {fieldErrors.confirmPassword ? (
                <FieldError>{fieldErrors.confirmPassword}</FieldError>
              ) : null}
            </Field>
          </>
        ) : null}

        <Field data-invalid={fieldErrors.role ? true : undefined}>
          <FieldLabel htmlFor="user-role">Role</FieldLabel>
          <select
            id="user-role"
            name="role"
            value={form.role}
            disabled={disabled || roleDisabled}
            aria-invalid={fieldErrors.role ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("role", event.target.value as UserRoleOption)
            }
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
              </option>
            ))}
          </select>
          {fieldErrors.role ? <FieldError>{fieldErrors.role}</FieldError> : null}
          {roleDisabled ? (
            <p className="text-muted-foreground text-xs">
              You cannot change your own role.
            </p>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.isActive ? true : undefined}>
          <FieldLabel htmlFor="user-isActive">Status</FieldLabel>
          <select
            id="user-isActive"
            name="isActive"
            value={form.isActive ? "active" : "inactive"}
            disabled={disabled || statusDisabled}
            aria-invalid={fieldErrors.isActive ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              updateField("isActive", event.target.value === "active")
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {fieldErrors.isActive ? (
            <FieldError>{fieldErrors.isActive}</FieldError>
          ) : null}
          {statusDisabled ? (
            <p className="text-muted-foreground text-xs">
              You cannot change your own account status.
            </p>
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
