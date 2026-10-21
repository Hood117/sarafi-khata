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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormGrid, FormSection } from "@/design-system/form-layout";
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
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
      // Full reload so <html lang/dir> and dictionaries update for Dari/Pashto.
      window.location.assign("/settings");
    } catch {
      setFormError(t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormSection
        title={t.settings.shopPreferences}
        description={t.settings.languageHint}
        className="bg-card ring-foreground/10 gap-4 rounded-2xl p-4 shadow-sm ring-1"
      >
        <FieldGroup className="gap-4">
          <Field data-invalid={fieldErrors.businessName ? true : undefined}>
            <FieldLabel htmlFor="settings-businessName">
              {t.settings.businessName}
            </FieldLabel>
            <Input
              id="settings-businessName"
              name="businessName"
              placeholder="ASMS"
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

          <FormGrid columns={2} className="gap-4">
            <Field
              data-invalid={fieldErrors.baseCurrencyCode ? true : undefined}
              className="min-w-0"
            >
              <FieldLabel htmlFor="settings-baseCurrencyCode">
                {t.settings.baseCurrency}
              </FieldLabel>
              <Select
                value={form.baseCurrencyCode || null}
                onValueChange={(value) =>
                  updateField(
                    "baseCurrencyCode",
                    typeof value === "string" ? value : "",
                  )
                }
                disabled={isSubmitting || currencies.length === 0}
              >
                <SelectTrigger
                  id="settings-baseCurrencyCode"
                  size="default"
                  className="w-full max-w-[13rem]"
                  aria-invalid={
                    fieldErrors.baseCurrencyCode ? true : undefined
                  }
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  side="bottom"
                  align="start"
                  className="min-w-[13rem]"
                >
                  {currencies.map((currency) => (
                    <SelectItem key={currency.id} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.baseCurrencyCode ? (
                <FieldError>{fieldErrors.baseCurrencyCode}</FieldError>
              ) : null}
            </Field>

            <Field
              data-invalid={fieldErrors.locale ? true : undefined}
              className="min-w-0"
            >
              <FieldLabel htmlFor="settings-locale">
                {t.settings.language}
              </FieldLabel>
              <Select
                value={form.locale || null}
                onValueChange={(value) =>
                  updateField("locale", typeof value === "string" ? value : "")
                }
                disabled={isSubmitting}
              >
                <SelectTrigger
                  id="settings-locale"
                  size="default"
                  className="w-full max-w-[13rem]"
                  aria-invalid={fieldErrors.locale ? true : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  side="bottom"
                  align="start"
                  className="min-w-[13rem]"
                >
                  {LOCALE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.locale ? (
                <FieldError>{fieldErrors.locale}</FieldError>
              ) : null}
            </Field>
          </FormGrid>
        </FieldGroup>
      </FormSection>

      <FormSection
        title={t.settings.receiptPreferences}
        description="Printer templates and receipt layout options will appear here."
        className="bg-card ring-foreground/10 gap-4 rounded-2xl p-4 shadow-sm ring-1"
      >
        <div className="bg-muted/40 space-y-3 rounded-xl px-3 py-2.5 ring-1 ring-foreground/10">
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input type="checkbox" disabled className="size-4 rounded" />
            {t.settings.showBusinessNameOnReceipts}
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
              {t.common.loading}
            </>
          ) : (
            t.settings.saveSettings
          )}
        </Button>
      </div>
    </form>
  );
}
