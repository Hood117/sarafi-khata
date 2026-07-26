"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

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
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaDirection,
  HawalaPartySource,
  HawalaWalletOption,
} from "@/features/hawala/domain/types";
import {
  hawalaPartySchema,
  toHawalaFieldErrors,
  type HawalaFieldErrors,
} from "@/features/hawala/schemas/hawala";
import { listCityOptions, listCountryOptions } from "@/lib/locations";
import { cn } from "@/lib/utils";

const COUNTRY_OPTIONS = listCountryOptions();

export type HawalaFormValues = {
  senderSource: HawalaPartySource;
  senderCustomerId: string;
  senderName: string;
  senderPhone: string;
  receiverSource: HawalaPartySource;
  receiverCustomerId: string;
  receiverName: string;
  receiverPhone: string;
  partnerSarafi: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  reference: string;
  currencyCode: string;
  amount: string;
  notes: string;
  cashWalletId: string;
  clearingWalletId: string;
  valueDate: string;
};

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyHawalaFormValues(options?: {
  cashWalletId?: string;
  clearingWalletId?: string;
  currencyCode?: string;
  valueDate?: string;
}): HawalaFormValues {
  return {
    senderSource: "external",
    senderCustomerId: "",
    senderName: "",
    senderPhone: "",
    receiverSource: "external",
    receiverCustomerId: "",
    receiverName: "",
    receiverPhone: "",
    partnerSarafi: "",
    originCity: "",
    originCountry: "",
    destinationCity: "",
    destinationCountry: "",
    reference: "",
    currencyCode: options?.currencyCode ?? "",
    amount: "",
    notes: "",
    cashWalletId: options?.cashWalletId ?? "",
    clearingWalletId: options?.clearingWalletId ?? "",
    valueDate: options?.valueDate ?? todayInputValue(),
  };
}

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
      <div className="space-y-1">
        <Typography variant="bodySm" className="font-medium">
          {title}
        </Typography>
        {description ? (
          <Typography variant="muted" className="text-xs">
            {description}
          </Typography>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SourceToggle({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: HawalaPartySource;
  disabled: boolean;
  onChange: (value: HawalaPartySource) => void;
}) {
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-lg p-1"
      role="radiogroup"
      aria-label="Party source"
    >
      {(
        [
          ["customer", "Existing customer"],
          ["external", "External person"],
        ] as const
      ).map(([source, label]) => {
        const selected = value === source;
        return (
          <button
            key={source}
            id={`${id}-${source}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
            onClick={() => onChange(source)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type HawalaFormProps = {
  direction: HawalaDirection;
  customers: HawalaCustomerOption[];
  cashWallets: HawalaWalletOption[];
  clearingWallets: HawalaWalletOption[];
  currencies: HawalaCurrencyOption[];
  initialValues?: HawalaFormValues;
  submitLabel?: string;
  errorFallbackMessage?: string;
  onCancel: () => void;
  onSubmit: (
    values: HawalaFormValues,
  ) => Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        message: string;
        fieldErrors?: HawalaFieldErrors;
      }
  >;
  onSuccess?: (message: string) => void;
};

export function HawalaForm({
  direction,
  customers,
  cashWallets,
  clearingWallets,
  currencies,
  initialValues,
  submitLabel,
  errorFallbackMessage = "Unable to save hawala. Please try again.",
  onCancel,
  onSubmit,
  onSuccess,
}: HawalaFormProps) {
  const [form, setForm] = useState<HawalaFormValues>(
    initialValues ?? emptyHawalaFormValues(),
  );
  const [fieldErrors, setFieldErrors] = useState<HawalaFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedSubmitLabel =
    submitLabel ??
    (direction === "SEND" ? "Send Hawala" : "Receive Hawala");

  const walletHelp =
    direction === "SEND"
      ? "Send posts cash into the clearing wallet (debit cash, credit clearing)."
      : "Receive posts cash out of the clearing wallet (debit clearing, credit cash).";

  function updateField<K extends keyof HawalaFormValues>(
    key: K,
    value: HawalaFormValues[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
    setSuccessMessage(null);
  }

  function updateOriginCountry(country: string) {
    setForm((current) => {
      const cities = listCityOptions(country).map((option) => option.value);
      const keepCity = cities.includes(current.originCity)
        ? current.originCity
        : "";
      return {
        ...current,
        originCountry: country,
        originCity: keepCity,
      };
    });
    setFieldErrors((current) => ({
      ...current,
      originCountry: undefined,
      originCity: undefined,
    }));
    setFormError(null);
    setSuccessMessage(null);
  }

  function updateDestinationCountry(country: string) {
    setForm((current) => {
      const cities = listCityOptions(country).map((option) => option.value);
      const keepCity = cities.includes(current.destinationCity)
        ? current.destinationCity
        : "";
      return {
        ...current,
        destinationCountry: country,
        destinationCity: keepCity,
      };
    });
    setFieldErrors((current) => ({
      ...current,
      destinationCountry: undefined,
      destinationCity: undefined,
    }));
    setFormError(null);
    setSuccessMessage(null);
  }

  const originCityOptions = listCityOptions(form.originCountry);
  const destinationCityOptions = listCityOptions(form.destinationCountry);

  function applySenderSource(source: HawalaPartySource) {
    setForm((current) => ({
      ...current,
      senderSource: source,
      senderCustomerId: source === "customer" ? current.senderCustomerId : "",
      senderName: source === "external" ? current.senderName : "",
      senderPhone: source === "external" ? current.senderPhone : "",
    }));
    setFieldErrors((current) => ({
      ...current,
      senderName: undefined,
      senderCustomerId: undefined,
    }));
    setFormError(null);
  }

  function applyReceiverSource(source: HawalaPartySource) {
    setForm((current) => ({
      ...current,
      receiverSource: source,
      receiverCustomerId:
        source === "customer" ? current.receiverCustomerId : "",
      receiverName: source === "external" ? current.receiverName : "",
      receiverPhone: source === "external" ? current.receiverPhone : "",
    }));
    setFieldErrors((current) => ({
      ...current,
      receiverName: undefined,
      receiverCustomerId: undefined,
    }));
    setFormError(null);
  }

  function selectSenderCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    setForm((current) => ({
      ...current,
      senderSource: "customer",
      senderCustomerId: customerId,
      senderName: customer?.fullName ?? "",
      senderPhone: customer?.phone ?? "",
    }));
    setFieldErrors((current) => ({
      ...current,
      senderName: undefined,
      senderCustomerId: undefined,
    }));
    setFormError(null);
  }

  function selectReceiverCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    setForm((current) => ({
      ...current,
      receiverSource: "customer",
      receiverCustomerId: customerId,
      receiverName: customer?.fullName ?? "",
      receiverPhone: customer?.phone ?? "",
    }));
    setFieldErrors((current) => ({
      ...current,
      receiverName: undefined,
      receiverCustomerId: undefined,
    }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const payload = {
      senderName: form.senderSource === "external" ? form.senderName : "",
      senderPhone: form.senderPhone,
      receiverName: form.receiverSource === "external" ? form.receiverName : "",
      receiverPhone: form.receiverPhone,
      senderCustomerId:
        form.senderSource === "customer" ? form.senderCustomerId || null : null,
      receiverCustomerId:
        form.receiverSource === "customer"
          ? form.receiverCustomerId || null
          : null,
      partnerSarafi: form.partnerSarafi,
      originCity: form.originCity,
      originCountry: form.originCountry,
      destinationCity: form.destinationCity,
      destinationCountry: form.destinationCountry,
      reference: form.reference,
      currencyCode: form.currencyCode,
      amount: form.amount,
      notes: form.notes,
      cashWalletId: form.cashWalletId,
      clearingWalletId: form.clearingWalletId,
      valueDate: form.valueDate || undefined,
    };

    if (form.senderSource === "customer" && !form.senderCustomerId) {
      setFieldErrors({ senderCustomerId: "Select a local customer." });
      setFormError("Please correct the highlighted fields.");
      return;
    }

    if (form.receiverSource === "customer" && !form.receiverCustomerId) {
      setFieldErrors({ receiverCustomerId: "Select a local customer." });
      setFormError("Please correct the highlighted fields.");
      return;
    }

    const parsed = hawalaPartySchema.safeParse(payload);

    if (!parsed.success) {
      setFieldErrors(toHawalaFieldErrors(parsed.error));
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit(form);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.message || errorFallbackMessage);
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? (
        <div
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      <FieldGroup className="gap-4">
        <FormSection
          title="Parties"
          description="Choose an existing local customer or enter an external person. External people are not registered as customers."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Typography variant="bodySm" className="font-medium">
                Sender
              </Typography>
              <SourceToggle
                id="hawala-sender-source"
                value={form.senderSource}
                disabled={isSubmitting}
                onChange={applySenderSource}
              />

              {form.senderSource === "customer" ? (
                <Field
                  data-invalid={
                    fieldErrors.senderCustomerId || fieldErrors.senderName
                      ? true
                      : undefined
                  }
                >
                  <FieldLabel htmlFor="hawala-sender-customer">
                    Local customer
                  </FieldLabel>
                  <select
                    id="hawala-sender-customer"
                    className={selectClassName}
                    value={form.senderCustomerId}
                    onChange={(event) =>
                      selectSenderCustomer(event.target.value)
                    }
                    disabled={isSubmitting}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.label}
                      </option>
                    ))}
                  </select>
                  <FieldError>
                    {fieldErrors.senderCustomerId ?? fieldErrors.senderName}
                  </FieldError>
                </Field>
              ) : (
                <div className="grid gap-3">
                  <Field data-invalid={fieldErrors.senderName ? true : undefined}>
                    <FieldLabel htmlFor="hawala-sender-name">Name</FieldLabel>
                    <Input
                      id="hawala-sender-name"
                      value={form.senderName}
                      onChange={(event) =>
                        updateField("senderName", event.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.senderName}</FieldError>
                  </Field>
                  <Field
                    data-invalid={fieldErrors.senderPhone ? true : undefined}
                  >
                    <FieldLabel htmlFor="hawala-sender-phone">Phone</FieldLabel>
                    <Input
                      id="hawala-sender-phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.senderPhone}
                      onChange={(event) =>
                        updateField("senderPhone", event.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.senderPhone}</FieldError>
                  </Field>
                </div>
              )}

              {form.senderSource === "customer" && form.senderCustomerId ? (
                <Typography variant="muted" className="text-xs">
                  {form.senderName}
                  {form.senderPhone ? ` · ${form.senderPhone}` : ""}
                </Typography>
              ) : null}
            </div>

            <div className="space-y-3">
              <Typography variant="bodySm" className="font-medium">
                Receiver
              </Typography>
              <SourceToggle
                id="hawala-receiver-source"
                value={form.receiverSource}
                disabled={isSubmitting}
                onChange={applyReceiverSource}
              />

              {form.receiverSource === "customer" ? (
                <Field
                  data-invalid={
                    fieldErrors.receiverCustomerId || fieldErrors.receiverName
                      ? true
                      : undefined
                  }
                >
                  <FieldLabel htmlFor="hawala-receiver-customer">
                    Local customer
                  </FieldLabel>
                  <select
                    id="hawala-receiver-customer"
                    className={selectClassName}
                    value={form.receiverCustomerId}
                    onChange={(event) =>
                      selectReceiverCustomer(event.target.value)
                    }
                    disabled={isSubmitting}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.label}
                      </option>
                    ))}
                  </select>
                  <FieldError>
                    {fieldErrors.receiverCustomerId ?? fieldErrors.receiverName}
                  </FieldError>
                </Field>
              ) : (
                <div className="grid gap-3">
                  <Field
                    data-invalid={fieldErrors.receiverName ? true : undefined}
                  >
                    <FieldLabel htmlFor="hawala-receiver-name">Name</FieldLabel>
                    <Input
                      id="hawala-receiver-name"
                      value={form.receiverName}
                      onChange={(event) =>
                        updateField("receiverName", event.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.receiverName}</FieldError>
                  </Field>
                  <Field
                    data-invalid={fieldErrors.receiverPhone ? true : undefined}
                  >
                    <FieldLabel htmlFor="hawala-receiver-phone">Phone</FieldLabel>
                    <Input
                      id="hawala-receiver-phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.receiverPhone}
                      onChange={(event) =>
                        updateField("receiverPhone", event.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.receiverPhone}</FieldError>
                  </Field>
                </div>
              )}

              {form.receiverSource === "customer" && form.receiverCustomerId ? (
                <Typography variant="muted" className="text-xs">
                  {form.receiverName}
                  {form.receiverPhone ? ` · ${form.receiverPhone}` : ""}
                </Typography>
              ) : null}
            </div>
          </div>

          <Field data-invalid={fieldErrors.partnerSarafi ? true : undefined}>
            <FieldLabel htmlFor="hawala-partner">Partner Sarafi</FieldLabel>
            <Input
              id="hawala-partner"
              value={form.partnerSarafi}
              onChange={(event) =>
                updateField("partnerSarafi", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.partnerSarafi}</FieldError>
          </Field>
        </FormSection>

        <FormSection title="Corridor">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={fieldErrors.originCountry ? true : undefined}>
              <FieldLabel htmlFor="hawala-origin-country">
                Origin country
              </FieldLabel>
              <select
                id="hawala-origin-country"
                value={form.originCountry}
                onChange={(event) => updateOriginCountry(event.target.value)}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.originCountry ? true : undefined}
                className={selectClassName}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.originCountry}</FieldError>
            </Field>

            <Field data-invalid={fieldErrors.originCity ? true : undefined}>
              <FieldLabel htmlFor="hawala-origin-city">Origin city</FieldLabel>
              <select
                id="hawala-origin-city"
                value={form.originCity}
                onChange={(event) =>
                  updateField("originCity", event.target.value)
                }
                disabled={isSubmitting || !form.originCountry}
                aria-invalid={fieldErrors.originCity ? true : undefined}
                className={selectClassName}
              >
                <option value="">
                  {form.originCountry ? "Select city" : "Select country first"}
                </option>
                {originCityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.originCity}</FieldError>
            </Field>

            <Field
              data-invalid={fieldErrors.destinationCountry ? true : undefined}
            >
              <FieldLabel htmlFor="hawala-destination-country">
                Destination country
              </FieldLabel>
              <select
                id="hawala-destination-country"
                value={form.destinationCountry}
                onChange={(event) =>
                  updateDestinationCountry(event.target.value)
                }
                disabled={isSubmitting}
                aria-invalid={
                  fieldErrors.destinationCountry ? true : undefined
                }
                className={selectClassName}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.destinationCountry}</FieldError>
            </Field>

            <Field
              data-invalid={fieldErrors.destinationCity ? true : undefined}
            >
              <FieldLabel htmlFor="hawala-destination-city">
                Destination city
              </FieldLabel>
              <select
                id="hawala-destination-city"
                value={form.destinationCity}
                onChange={(event) =>
                  updateField("destinationCity", event.target.value)
                }
                disabled={isSubmitting || !form.destinationCountry}
                aria-invalid={fieldErrors.destinationCity ? true : undefined}
                className={selectClassName}
              >
                <option value="">
                  {form.destinationCountry
                    ? "Select city"
                    : "Select country first"}
                </option>
                {destinationCityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.destinationCity}</FieldError>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Amount & wallets" description={walletHelp}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={fieldErrors.reference ? true : undefined}>
              <FieldLabel htmlFor="hawala-reference">Reference number</FieldLabel>
              <Input
                id="hawala-reference"
                value={form.reference}
                onChange={(event) =>
                  updateField("reference", event.target.value)
                }
                disabled={isSubmitting}
              />
              <FieldError>{fieldErrors.reference}</FieldError>
            </Field>

            <Field data-invalid={fieldErrors.valueDate ? true : undefined}>
              <FieldLabel htmlFor="hawala-value-date">Value date</FieldLabel>
              <Input
                id="hawala-value-date"
                type="date"
                value={form.valueDate}
                onChange={(event) =>
                  updateField("valueDate", event.target.value)
                }
                disabled={isSubmitting}
              />
              <FieldError>{fieldErrors.valueDate}</FieldError>
            </Field>

            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="hawala-amount">Amount</FieldLabel>
              <Input
                id="hawala-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
                disabled={isSubmitting}
              />
              <FieldError>{fieldErrors.amount}</FieldError>
            </Field>

            <Field data-invalid={fieldErrors.currencyCode ? true : undefined}>
              <FieldLabel htmlFor="hawala-currency">Currency</FieldLabel>
              <select
                id="hawala-currency"
                className={selectClassName}
                value={form.currencyCode}
                onChange={(event) =>
                  updateField("currencyCode", event.target.value)
                }
                disabled={isSubmitting}
              >
                <option value="">Select currency</option>
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.currencyCode}</FieldError>
            </Field>

            <Field data-invalid={fieldErrors.cashWalletId ? true : undefined}>
              <FieldLabel htmlFor="hawala-cash-wallet">Cash wallet</FieldLabel>
              <select
                id="hawala-cash-wallet"
                className={selectClassName}
                value={form.cashWalletId}
                onChange={(event) =>
                  updateField("cashWalletId", event.target.value)
                }
                disabled={isSubmitting}
              >
                <option value="">Select vault or till</option>
                {cashWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.cashWalletId}</FieldError>
            </Field>

            <Field
              data-invalid={fieldErrors.clearingWalletId ? true : undefined}
            >
              <FieldLabel htmlFor="hawala-clearing-wallet">
                Clearing wallet
              </FieldLabel>
              <select
                id="hawala-clearing-wallet"
                className={selectClassName}
                value={form.clearingWalletId}
                onChange={(event) =>
                  updateField("clearingWalletId", event.target.value)
                }
                disabled={isSubmitting}
              >
                <option value="">Select system wallet</option>
                {clearingWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.label}
                  </option>
                ))}
              </select>
              <FieldError>{fieldErrors.clearingWalletId}</FieldError>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Notes">
          <Field data-invalid={fieldErrors.notes ? true : undefined}>
            <FieldLabel htmlFor="hawala-notes">Notes</FieldLabel>
            <Textarea
              id="hawala-notes"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
            <FieldError>{fieldErrors.notes}</FieldError>
          </Field>
        </FormSection>
      </FieldGroup>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Saving…
            </>
          ) : (
            resolvedSubmitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
