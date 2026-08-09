"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { defaultScreensForRole } from "@/features/auth/permissions/catalog";
import {
  APP_SCREENS,
  type AppScreenId,
} from "@/features/auth/permissions/screens";
import type { UserFieldErrors } from "@/features/users/actions/user-actions";
import { formatRole } from "@/features/users/domain/format-role";
import { USER_ROLES, type UserRoleOption } from "@/features/users/domain/types";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type UserFormValues = {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: UserRoleOption;
  isActive: boolean;
  allowedScreens: AppScreenId[];
};

export const emptyUserFormValues: UserFormValues = {
  fullName: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "CASHIER",
  isActive: true,
  allowedScreens: defaultScreensForRole("CASHIER"),
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
  /** When true, screen rights cannot be edited (e.g. editing yourself). */
  screensDisabled?: boolean;
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
  screensDisabled = false,
  submitLabel,
  errorFallbackMessage,
  isBusy = false,
  onCancel,
  onSubmit,
  onSuccess,
}: UserFormProps) {
  const t = useT();
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

  function toggleScreen(screenId: AppScreenId, checked: boolean) {
    setForm((current) => {
      const next = checked
        ? Array.from(new Set([...current.allowedScreens, screenId]))
        : current.allowedScreens.filter((id) => id !== screenId);
      return { ...current, allowedScreens: next };
    });
    setFieldErrors((current) => ({ ...current, allowedScreens: undefined }));
    setFormError(null);
    setSuccessMessage(null);
  }

  function handleRoleChange(role: UserRoleOption) {
    setForm((current) => ({
      ...current,
      role,
      allowedScreens: defaultScreensForRole(role),
    }));
    setFieldErrors((current) => ({
      ...current,
      role: undefined,
      allowedScreens: undefined,
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

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FieldGroup>
        <Field data-invalid={fieldErrors.fullName ? true : undefined}>
          <FieldLabel htmlFor="user-fullName">{t.common.fullName}</FieldLabel>
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
          <FieldLabel htmlFor="user-username">{t.users.username}</FieldLabel>
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
              <FieldLabel htmlFor="user-password">{t.login.password}</FieldLabel>
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
          <FieldLabel htmlFor="user-role">{t.users.role}</FieldLabel>
          <select
            id="user-role"
            name="role"
            value={form.role}
            disabled={disabled || roleDisabled}
            aria-invalid={fieldErrors.role ? true : undefined}
            className={selectClassName}
            onChange={(event) =>
              handleRoleChange(event.target.value as UserRoleOption)
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
          ) : (
            <p className="text-muted-foreground text-xs">
              Changing role resets the screen list to that role&apos;s defaults.
            </p>
          )}
        </Field>

        <Field data-invalid={fieldErrors.isActive ? true : undefined}>
          <FieldLabel htmlFor="user-isActive">{t.common.status}</FieldLabel>
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
            <option value="active">{t.common.active}</option>
            <option value="inactive">{t.common.inactive}</option>
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

        <Field data-invalid={fieldErrors.allowedScreens ? true : undefined}>
          <FieldLabel>Screen rights</FieldLabel>
          <p className="text-muted-foreground mb-2 text-xs">
            Choose which screens this user can open in the sidebar.
          </p>
          <div className="border-border max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
            {APP_SCREENS.map((screen) => {
              const checked = form.allowedScreens.includes(screen.id);
              return (
                <label
                  key={screen.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled || screensDisabled}
                    onCheckedChange={(value) =>
                      toggleScreen(screen.id, value === true)
                    }
                  />
                  <span>{screen.label}</span>
                </label>
              );
            })}
          </div>
          {fieldErrors.allowedScreens ? (
            <FieldError>{fieldErrors.allowedScreens}</FieldError>
          ) : null}
          {screensDisabled ? (
            <p className="text-muted-foreground text-xs">
              You cannot change your own screen rights.
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
