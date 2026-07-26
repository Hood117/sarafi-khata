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
import type {
  HawalaCurrencyOption,
  HawalaCustomerOption,
  HawalaDirection,
  HawalaWalletOption,
} from "@/features/hawala/domain/types";
import {
  hawalaPartySchema,
  toHawalaFieldErrors,
  type HawalaFieldErrors,
} from "@/features/hawala/schemas/hawala";

export type HawalaFormValues = {
  senderName: string;
  senderPhone: string;
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
  customerId: string;
  cashWalletId: string;
  clearingWalletId: string;
};

export function emptyHawalaFormValues(
  options?: {
    cashWalletId?: string;
    clearingWalletId?: string;
    currencyCode?: string;
  },
): HawalaFormValues {
  return {
    senderName: "",
    senderPhone: "",
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
    customerId: "",
    cashWalletId: options?.cashWalletId ?? "",
    clearingWalletId: options?.clearingWalletId ?? "",
  };
}

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

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

  function updateField<K extends keyof HawalaFormValues>(
    key: K,
    value: HawalaFormValues[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const parsed = hawalaPartySchema.safeParse({
      ...form,
      customerId: form.customerId || null,
      notes: form.notes,
    });

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

      <FieldGroup className="gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={fieldErrors.senderName ? true : undefined}>
            <FieldLabel htmlFor="hawala-sender-name">Sender</FieldLabel>
            <Input
              id="hawala-sender-name"
              value={form.senderName}
              onChange={(event) => updateField("senderName", event.target.value)}
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.senderName}</FieldError>
          </Field>

          <Field data-invalid={fieldErrors.senderPhone ? true : undefined}>
            <FieldLabel htmlFor="hawala-sender-phone">Sender phone</FieldLabel>
            <Input
              id="hawala-sender-phone"
              value={form.senderPhone}
              onChange={(event) =>
                updateField("senderPhone", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.senderPhone}</FieldError>
          </Field>

          <Field data-invalid={fieldErrors.receiverName ? true : undefined}>
            <FieldLabel htmlFor="hawala-receiver-name">Receiver</FieldLabel>
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

          <Field data-invalid={fieldErrors.receiverPhone ? true : undefined}>
            <FieldLabel htmlFor="hawala-receiver-phone">
              Receiver phone
            </FieldLabel>
            <Input
              id="hawala-receiver-phone"
              value={form.receiverPhone}
              onChange={(event) =>
                updateField("receiverPhone", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.receiverPhone}</FieldError>
          </Field>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={fieldErrors.originCity ? true : undefined}>
            <FieldLabel htmlFor="hawala-origin-city">Origin city</FieldLabel>
            <Input
              id="hawala-origin-city"
              value={form.originCity}
              onChange={(event) => updateField("originCity", event.target.value)}
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.originCity}</FieldError>
          </Field>

          <Field data-invalid={fieldErrors.originCountry ? true : undefined}>
            <FieldLabel htmlFor="hawala-origin-country">
              Origin country
            </FieldLabel>
            <Input
              id="hawala-origin-country"
              value={form.originCountry}
              onChange={(event) =>
                updateField("originCountry", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.originCountry}</FieldError>
          </Field>

          <Field data-invalid={fieldErrors.destinationCity ? true : undefined}>
            <FieldLabel htmlFor="hawala-destination-city">
              Destination city
            </FieldLabel>
            <Input
              id="hawala-destination-city"
              value={form.destinationCity}
              onChange={(event) =>
                updateField("destinationCity", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.destinationCity}</FieldError>
          </Field>

          <Field
            data-invalid={fieldErrors.destinationCountry ? true : undefined}
          >
            <FieldLabel htmlFor="hawala-destination-country">
              Destination country
            </FieldLabel>
            <Input
              id="hawala-destination-country"
              value={form.destinationCountry}
              onChange={(event) =>
                updateField("destinationCountry", event.target.value)
              }
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.destinationCountry}</FieldError>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={fieldErrors.reference ? true : undefined}>
            <FieldLabel htmlFor="hawala-reference">Reference number</FieldLabel>
            <Input
              id="hawala-reference"
              value={form.reference}
              onChange={(event) => updateField("reference", event.target.value)}
              disabled={isSubmitting}
            />
            <FieldError>{fieldErrors.reference}</FieldError>
          </Field>

          <Field data-invalid={fieldErrors.amount ? true : undefined}>
            <FieldLabel htmlFor="hawala-amount">Amount</FieldLabel>
            <Input
              id="hawala-amount"
              inputMode="decimal"
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

          <Field data-invalid={fieldErrors.customerId ? true : undefined}>
            <FieldLabel htmlFor="hawala-customer">
              Local customer (optional)
            </FieldLabel>
            <select
              id="hawala-customer"
              className={selectClassName}
              value={form.customerId}
              onChange={(event) => updateField("customerId", event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">None</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
            <FieldError>{fieldErrors.customerId}</FieldError>
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
