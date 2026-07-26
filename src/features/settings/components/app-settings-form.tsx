"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/design-system/form-layout";
import { Typography } from "@/design-system/typography";
import {
  updateAppSettingsAction,
  type SettingsFieldErrors,
} from "@/features/settings/actions/settings-actions";
import { LOCALE_OPTIONS } from "@/features/settings/domain/setting-keys";
import type {
  AppSettings,
  SettingsCurrencyOption,
} from "@/features/settings/domain/types";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type AppSettingsFormValues = {
  businessName: string;
  baseCurrencyCode: string;
  locale: string;
};

type AppSettingsFormProps = {
  initialSettings: AppSettings;
  currencies: SettingsCurrencyOption[];
  onSuccess?: (message: string) => void;
};

export function AppSettingsForm({
  initialSettings,
  currencies,
  onSuccess,
}: AppSettingsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<AppSettingsFormValues>({
    businessName: initialSettings.businessName,
    baseCurrencyCode: initialSettings.baseCurrencyCode,
    locale: initialSettings.locale,
  });
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof AppSettingsFormValues>(
    key: K,
    value: AppSettingsFormValues[K],
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
      const result = await updateAppSettingsAction({
        businessName: form.businessName,
        baseCurrencyCode: form.baseCurrencyCode,
        locale: form.locale,
      });

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.message);
        return;
      }

      setForm({
        businessName: result.settings.businessName,
        baseCurrencyCode: result.settings.baseCurrencyCode,
        locale: result.settings.locale,
      });
      setSuccessMessage(result.message);
      onSuccess?.(result.message);
      router.refresh();
    } catch {
      setFormError("Unable to save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <FormSection
        title="Shop preferences"
        description="Basic business identity used across receipts and the app shell."
      >
        <FieldGroup>
          <Field data-invalid={fieldErrors.businessName ? true : undefined}>
            <FieldLabel htmlFor="settings-businessName">
              Business name
            </FieldLabel>
            <Input
              id="settings-businessName"
              name="businessName"
              placeholder="Saraf"
              value={form.businessName}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.businessName ? true : undefined}
              onChange={(event) =>
                updateField("businessName", event.target.value)
              }
            />
            {fieldErrors.businessName ? (
              <FieldError>{fieldErrors.businessName}</FieldError>
            ) : null}
          </Field>

          <Field
            data-invalid={fieldErrors.baseCurrencyCode ? true : undefined}
          >
            <FieldLabel htmlFor="settings-baseCurrencyCode">
              Base currency
            </FieldLabel>
            <select
              id="settings-baseCurrencyCode"
              name="baseCurrencyCode"
              value={form.baseCurrencyCode}
              disabled={isSubmitting || currencies.length === 0}
              aria-invalid={fieldErrors.baseCurrencyCode ? true : undefined}
              className={selectClassName}
              onChange={(event) =>
                updateField("baseCurrencyCode", event.target.value)
              }
            >
              {currencies.length === 0 ? (
                <option value="">No active currencies</option>
              ) : null}
              {currencies.map((currency) => (
                <option key={currency.id} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
            <Typography variant="caption">
              Used as the default currency for empty wallet balances and
              reporting context.
            </Typography>
            {fieldErrors.baseCurrencyCode ? (
              <FieldError>{fieldErrors.baseCurrencyCode}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={fieldErrors.locale ? true : undefined}>
            <FieldLabel htmlFor="settings-locale">Default language</FieldLabel>
            <select
              id="settings-locale"
              name="locale"
              value={form.locale}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.locale ? true : undefined}
              className={selectClassName}
              onChange={(event) => updateField("locale", event.target.value)}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={"disabled" in option ? option.disabled : false}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <Typography variant="caption">
              Placeholder for future Dari / Pashto and RTL support.
            </Typography>
            {fieldErrors.locale ? (
              <FieldError>{fieldErrors.locale}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
      </FormSection>

      <FormSection
        title="Receipt preferences"
        description="Printer templates and receipt layout options will appear here."
      >
        <div className="bg-muted/40 space-y-3 rounded-xl px-4 py-4 ring-1 ring-foreground/10">
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input type="checkbox" disabled className="size-4 rounded" />
            Show business name on receipts
          </label>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input type="checkbox" disabled className="size-4 rounded" />
            Include operator name on receipts
          </label>
          <Typography variant="caption">
            Coming soon — receipts currently use browser print only.
          </Typography>
        </div>
      </FormSection>

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

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </form>
  );
}
