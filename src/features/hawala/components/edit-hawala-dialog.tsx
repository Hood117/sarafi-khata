"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Typography } from "@/design-system/typography";
import {
  getHawalaForEditAction,
  updateHawalaAction,
} from "@/features/hawala/actions/hawala-actions";
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaPartnerOption,
  HawalaPartySource,
} from "@/features/hawala/domain/types";
import type { HawalaFieldErrors } from "@/features/hawala/schemas/hawala";
import { PartnerSarafiSearchSelect } from "@/features/partner-sarafi/components/partner-sarafi-search-select";
import { listCityOptions, listCountryOptions } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const COUNTRY_OPTIONS = listCountryOptions();

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type EditFormState = {
  hawalaId: string;
  reference: string;
  senderSource: HawalaPartySource;
  senderCustomerId: string;
  senderName: string;
  senderPhone: string;
  receiverSource: HawalaPartySource;
  receiverCustomerId: string;
  receiverName: string;
  receiverPhone: string;
  partnerSarafiId: string;
  partnerSarafi: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  notes: string;
  valueDate: string;
  currencyCode: string;
  amount: string;
  partnerCommissionAmount: string;
  ownCommissionAmount: string;
};

const emptyForm: EditFormState = {
  hawalaId: "",
  reference: "",
  senderSource: "external",
  senderCustomerId: "",
  senderName: "",
  senderPhone: "",
  receiverSource: "external",
  receiverCustomerId: "",
  receiverName: "",
  receiverPhone: "",
  partnerSarafiId: "",
  partnerSarafi: "",
  originCountry: "",
  originCity: "",
  destinationCountry: "",
  destinationCity: "",
  notes: "",
  valueDate: "",
  currencyCode: "",
  amount: "",
  partnerCommissionAmount: "",
  ownCommissionAmount: "",
};

type EditHawalaDialogProps = {
  hawalaId: string;
  customers: HawalaCustomerOption[];
  partners: HawalaPartnerOption[];
  currencies: HawalaCurrencyOption[];
  onSuccess?: (message: string) => void;
};

function SourceToggle({
  id,
  value,
  disabled,
  onChange,
  customerLabel,
  externalLabel,
  ariaLabel,
}: {
  id: string;
  value: HawalaPartySource;
  disabled: boolean;
  onChange: (value: HawalaPartySource) => void;
  customerLabel: string;
  externalLabel: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-lg p-1"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {(
        [
          ["customer", customerLabel],
          ["external", externalLabel],
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

export function EditHawalaDialog({
  hawalaId,
  customers,
  partners,
  currencies,
  onSuccess,
}: EditHawalaDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<HawalaFieldErrors>({});
  const [form, setForm] = useState<EditFormState>(emptyForm);
  const [direction, setDirection] = useState<"SEND" | "RECEIVE">("SEND");

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      setFormError(null);
      setFieldErrors({});

      try {
        const result = await getHawalaForEditAction(hawalaId);
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.message);
          setForm(emptyForm);
          return;
        }

        const h = result.hawala;
        setDirection(h.direction);
        setForm({
          hawalaId: h.hawalaId,
          reference: h.reference,
          senderSource: h.senderSource,
          senderCustomerId: h.senderCustomerId,
          senderName: h.senderName,
          senderPhone: h.senderPhone,
          receiverSource: h.receiverSource,
          receiverCustomerId: h.receiverCustomerId,
          receiverName: h.receiverName,
          receiverPhone: h.receiverPhone,
          partnerSarafiId: h.partnerSarafiId,
          partnerSarafi: h.partnerSarafi,
          originCountry: h.originCountry,
          originCity: h.originCity,
          destinationCountry: h.destinationCountry,
          destinationCity: h.destinationCity,
          notes: h.notes,
          valueDate: h.valueDate,
          currencyCode: h.currencyCode,
          amount: h.amount,
          partnerCommissionAmount: h.partnerCommissionAmount,
          ownCommissionAmount: h.ownCommissionAmount,
        });
      } catch {
        if (!cancelled) {
          setLoadError(t.hawala.loadError);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [hawalaId, open, t.hawala.loadError]);

  function updateField<K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await updateHawalaAction({
        hawalaId: form.hawalaId,
        reference: form.reference,
        senderName: form.senderSource === "external" ? form.senderName : "",
        senderPhone: form.senderSource === "external" ? form.senderPhone : null,
        senderCustomerId:
          form.senderSource === "customer" ? form.senderCustomerId : null,
        receiverName:
          form.receiverSource === "external" ? form.receiverName : "",
        receiverPhone:
          form.receiverSource === "external" ? form.receiverPhone : null,
        receiverCustomerId:
          form.receiverSource === "customer" ? form.receiverCustomerId : null,
        partnerSarafiId: form.partnerSarafiId,
        partnerSarafi: form.partnerSarafi,
        originCountry: form.originCountry,
        originCity: form.originCity,
        destinationCountry: form.destinationCountry,
        destinationCity: form.destinationCity,
        notes: form.notes,
        valueDate: form.valueDate,
        currencyCode: form.currencyCode,
        amount: form.amount,
        partnerCommissionAmount: form.partnerCommissionAmount || null,
        ownCommissionAmount: form.ownCommissionAmount || null,
      });

      if (!result.ok) {
        setFormError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onSuccess?.(result.message);
      setOpen(false);
      router.refresh();
    } catch {
      setFormError(t.hawala.updateError);
    } finally {
      setIsSubmitting(false);
    }
  }

  const originCities = listCityOptions(form.originCountry);
  const destinationCities = listCityOptions(form.destinationCountry);
  const disabled = isLoading || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>{t.common.edit}</DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.hawala.editTitle}</DialogTitle>
          <DialogDescription>
            {t.hawala.editDescription}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t.hawala.loadingHawala}
          </div>
        ) : loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FieldGroup>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field data-invalid={fieldErrors.amount ? true : undefined}>
                  <FieldLabel htmlFor="edit-hawala-amount">{t.common.amount}</FieldLabel>
                  <Input
                    id="edit-hawala-amount"
                    inputMode="decimal"
                    value={form.amount}
                    disabled={disabled}
                    onChange={(event) =>
                      updateField("amount", event.target.value)
                    }
                  />
                  {fieldErrors.amount ? (
                    <FieldError>{fieldErrors.amount}</FieldError>
                  ) : null}
                </Field>
                <Field
                  data-invalid={fieldErrors.currencyCode ? true : undefined}
                >
                  <FieldLabel htmlFor="edit-hawala-currency">
                    {t.common.currency}
                  </FieldLabel>
                  <select
                    id="edit-hawala-currency"
                    className={selectClassName}
                    value={form.currencyCode}
                    disabled={disabled}
                    onChange={(event) =>
                      updateField("currencyCode", event.target.value)
                    }
                  >
                    <option value="">{t.hawala.selectCurrency}</option>
                    {currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.currencyCode ? (
                    <FieldError>{fieldErrors.currencyCode}</FieldError>
                  ) : null}
                </Field>
              </div>

              <div className="bg-muted/30 space-y-3 rounded-xl p-3 ring-1 ring-foreground/5">
                <div className="space-y-1">
                  <Typography variant="bodySm" className="font-medium">
                    {t.hawala.fixedCommission}
                  </Typography>
                  <Typography variant="muted" className="text-xs">
                    {direction === "SEND"
                      ? t.hawala.fixedCommissionSendHint
                      : t.hawala.fixedCommissionReceiveHint}
                  </Typography>
                </div>
                <div
                  className={
                    direction === "SEND"
                      ? "grid gap-3 sm:grid-cols-2"
                      : "grid gap-3"
                  }
                >
                  {direction === "SEND" ? (
                    <Field
                      data-invalid={
                        fieldErrors.partnerCommissionAmount
                          ? true
                          : undefined
                      }
                    >
                      <FieldLabel htmlFor="edit-partner-commission">
                        {t.hawala.partnerCommissionAmount}
                      </FieldLabel>
                      <Input
                        id="edit-partner-commission"
                        inputMode="decimal"
                        value={form.partnerCommissionAmount}
                        disabled={disabled}
                        onChange={(event) =>
                          updateField(
                            "partnerCommissionAmount",
                            event.target.value,
                          )
                        }
                      />
                      {fieldErrors.partnerCommissionAmount ? (
                        <FieldError>
                          {fieldErrors.partnerCommissionAmount}
                        </FieldError>
                      ) : null}
                    </Field>
                  ) : null}
                  <Field
                    data-invalid={
                      fieldErrors.ownCommissionAmount ? true : undefined
                    }
                  >
                    <FieldLabel htmlFor="edit-own-commission">
                      {t.hawala.ownCommissionAmount}
                    </FieldLabel>
                    <Input
                      id="edit-own-commission"
                      inputMode="decimal"
                      value={form.ownCommissionAmount}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField("ownCommissionAmount", event.target.value)
                      }
                    />
                    {fieldErrors.ownCommissionAmount ? (
                      <FieldError>
                        {fieldErrors.ownCommissionAmount}
                      </FieldError>
                    ) : null}
                  </Field>
                </div>
              </div>

              <Field data-invalid={fieldErrors.reference ? true : undefined}>
                <FieldLabel htmlFor="edit-hawala-reference">
                  {t.common.reference}
                </FieldLabel>
                <Input
                  id="edit-hawala-reference"
                  value={form.reference}
                  disabled={disabled}
                  onChange={(event) =>
                    updateField("reference", event.target.value)
                  }
                />
                {fieldErrors.reference ? (
                  <FieldError>{fieldErrors.reference}</FieldError>
                ) : null}
              </Field>

              <Field>
                <FieldLabel>{t.hawala.sender}</FieldLabel>
                <SourceToggle
                  id="edit-sender"
                  value={form.senderSource}
                  disabled={disabled}
                  onChange={(value) => updateField("senderSource", value)}
                  customerLabel={t.hawala.existingCustomer}
                  externalLabel={t.hawala.externalPerson}
                  ariaLabel={t.hawala.partySource}
                />
              </Field>

              {form.senderSource === "customer" ? (
                <Field
                  data-invalid={
                    fieldErrors.senderCustomerId ? true : undefined
                  }
                >
                  <FieldLabel htmlFor="edit-sender-customer">
                    {t.hawala.localCustomer}
                  </FieldLabel>
                  <select
                    id="edit-sender-customer"
                    className={selectClassName}
                    value={form.senderCustomerId}
                    disabled={disabled}
                    onChange={(event) =>
                      updateField("senderCustomerId", event.target.value)
                    }
                  >
                    <option value="">{t.hawala.selectCustomer}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.senderCustomerId ? (
                    <FieldError>{fieldErrors.senderCustomerId}</FieldError>
                  ) : null}
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    data-invalid={fieldErrors.senderName ? true : undefined}
                  >
                    <FieldLabel htmlFor="edit-sender-name">
                      {t.hawala.senderName}
                    </FieldLabel>
                    <Input
                      id="edit-sender-name"
                      value={form.senderName}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField("senderName", event.target.value)
                      }
                    />
                    {fieldErrors.senderName ? (
                      <FieldError>{fieldErrors.senderName}</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-sender-phone">
                      {t.hawala.senderPhone}
                    </FieldLabel>
                    <Input
                      id="edit-sender-phone"
                      value={form.senderPhone}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField("senderPhone", event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              <Field>
                <FieldLabel>{t.hawala.receiver}</FieldLabel>
                <SourceToggle
                  id="edit-receiver"
                  value={form.receiverSource}
                  disabled={disabled}
                  onChange={(value) => updateField("receiverSource", value)}
                  customerLabel={t.hawala.existingCustomer}
                  externalLabel={t.hawala.externalPerson}
                  ariaLabel={t.hawala.partySource}
                />
              </Field>

              {form.receiverSource === "customer" ? (
                <Field
                  data-invalid={
                    fieldErrors.receiverCustomerId ? true : undefined
                  }
                >
                  <FieldLabel htmlFor="edit-receiver-customer">
                    {t.hawala.localCustomer}
                  </FieldLabel>
                  <select
                    id="edit-receiver-customer"
                    className={selectClassName}
                    value={form.receiverCustomerId}
                    disabled={disabled}
                    onChange={(event) =>
                      updateField("receiverCustomerId", event.target.value)
                    }
                  >
                    <option value="">{t.hawala.selectCustomer}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.receiverCustomerId ? (
                    <FieldError>{fieldErrors.receiverCustomerId}</FieldError>
                  ) : null}
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    data-invalid={fieldErrors.receiverName ? true : undefined}
                  >
                    <FieldLabel htmlFor="edit-receiver-name">
                      {t.hawala.receiverName}
                    </FieldLabel>
                    <Input
                      id="edit-receiver-name"
                      value={form.receiverName}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField("receiverName", event.target.value)
                      }
                    />
                    {fieldErrors.receiverName ? (
                      <FieldError>{fieldErrors.receiverName}</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-receiver-phone">
                      {t.hawala.receiverPhone}
                    </FieldLabel>
                    <Input
                      id="edit-receiver-phone"
                      value={form.receiverPhone}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField("receiverPhone", event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              <Field
                data-invalid={
                  fieldErrors.partnerSarafiId || fieldErrors.partnerSarafi
                    ? true
                    : undefined
                }
              >
                <FieldLabel htmlFor="edit-partner">{t.hawala.partner}</FieldLabel>
                <PartnerSarafiSearchSelect
                  id="edit-partner"
                  value={form.partnerSarafiId}
                  partners={partners}
                  disabled={disabled}
                  invalid={Boolean(
                    fieldErrors.partnerSarafiId || fieldErrors.partnerSarafi,
                  )}
                  onChange={(partnerId, partnerName) => {
                    setForm((current) => ({
                      ...current,
                      partnerSarafiId: partnerId,
                      partnerSarafi: partnerName,
                    }));
                    setFieldErrors((current) => ({
                      ...current,
                      partnerSarafiId: undefined,
                      partnerSarafi: undefined,
                    }));
                    setFormError(null);
                  }}
                />
                {fieldErrors.partnerSarafiId || fieldErrors.partnerSarafi ? (
                  <FieldError>
                    {fieldErrors.partnerSarafiId ?? fieldErrors.partnerSarafi}
                  </FieldError>
                ) : null}
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  data-invalid={fieldErrors.originCountry ? true : undefined}
                >
                  <FieldLabel htmlFor="edit-origin-country">
                    {t.hawala.originCountry}
                  </FieldLabel>
                  <select
                    id="edit-origin-country"
                    className={selectClassName}
                    value={form.originCountry}
                    disabled={disabled}
                    onChange={(event) => {
                      const country = event.target.value;
                      const cities = listCityOptions(country).map(
                        (option) => option.value,
                      );
                      setForm((current) => ({
                        ...current,
                        originCountry: country,
                        originCity: cities.includes(current.originCity)
                          ? current.originCity
                          : "",
                      }));
                    }}
                  >
                    <option value="">{t.hawala.selectCountry}</option>
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  data-invalid={fieldErrors.originCity ? true : undefined}
                >
                  <FieldLabel htmlFor="edit-origin-city">{t.hawala.originCity}</FieldLabel>
                  <select
                    id="edit-origin-city"
                    className={selectClassName}
                    value={form.originCity}
                    disabled={disabled || !form.originCountry}
                    onChange={(event) =>
                      updateField("originCity", event.target.value)
                    }
                  >
                    <option value="">{t.hawala.selectCity}</option>
                    {originCities.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.originCity ? (
                    <FieldError>{fieldErrors.originCity}</FieldError>
                  ) : null}
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  data-invalid={
                    fieldErrors.destinationCountry ? true : undefined
                  }
                >
                  <FieldLabel htmlFor="edit-dest-country">
                    {t.hawala.destinationCountry}
                  </FieldLabel>
                  <select
                    id="edit-dest-country"
                    className={selectClassName}
                    value={form.destinationCountry}
                    disabled={disabled}
                    onChange={(event) => {
                      const country = event.target.value;
                      const cities = listCityOptions(country).map(
                        (option) => option.value,
                      );
                      setForm((current) => ({
                        ...current,
                        destinationCountry: country,
                        destinationCity: cities.includes(
                          current.destinationCity,
                        )
                          ? current.destinationCity
                          : "",
                      }));
                    }}
                  >
                    <option value="">{t.hawala.selectCountry}</option>
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  data-invalid={
                    fieldErrors.destinationCity ? true : undefined
                  }
                >
                  <FieldLabel htmlFor="edit-dest-city">
                    {t.hawala.destinationCity}
                  </FieldLabel>
                  <select
                    id="edit-dest-city"
                    className={selectClassName}
                    value={form.destinationCity}
                    disabled={disabled || !form.destinationCountry}
                    onChange={(event) =>
                      updateField("destinationCity", event.target.value)
                    }
                  >
                    <option value="">{t.hawala.selectCity}</option>
                    {destinationCities.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.destinationCity ? (
                    <FieldError>{fieldErrors.destinationCity}</FieldError>
                  ) : null}
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="edit-value-date">{t.hawala.valueDate}</FieldLabel>
                <Input
                  id="edit-value-date"
                  type="date"
                  value={form.valueDate}
                  disabled={disabled}
                  onChange={(event) =>
                    updateField("valueDate", event.target.value)
                  }
                />
              </Field>

              <Field data-invalid={fieldErrors.notes ? true : undefined}>
                <FieldLabel htmlFor="edit-notes">{t.common.notes}</FieldLabel>
                <Textarea
                  id="edit-notes"
                  value={form.notes}
                  disabled={disabled}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </Field>
            </FieldGroup>

            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            ) : null}

            <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => setOpen(false)}
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
                  t.common.saveChanges
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
