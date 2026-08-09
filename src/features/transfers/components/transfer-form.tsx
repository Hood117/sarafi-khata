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
import { Textarea } from "@/components/ui/textarea";
import {
  FormActions,
  FormGrid,
  FormSection,
} from "@/design-system/form-layout";
import {
  createTransferAction,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
import { createTransferReference } from "@/features/transfers/domain/create-transfer-reference";
import type {
  TransferCurrencyOption,
  TransferCustomerOption,
} from "@/features/transfers/domain/types";
import {
  toTransferFormFieldErrors,
  transferFormSchema,
  type TransferFormFieldErrors,
} from "@/features/transfers/schemas/transfer-form";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type TransferFormValues = {
  senderCustomerId: string;
  receiverCustomerId: string;
  currencyCode: string;
  amount: string;
  reference: string;
  notes: string;
};

export function emptyTransferFormValues(): TransferFormValues {
  return {
    senderCustomerId: "",
    receiverCustomerId: "",
    currencyCode: "",
    amount: "",
    reference: createTransferReference(),
    notes: "",
  };
}

type TransferFormProps = {
  customers: TransferCustomerOption[];
  currencies: TransferCurrencyOption[];
  onSuccess?: (message: string) => void;
  onCancel?: () => void;
};

function mapActionFieldErrors(
  fieldErrors?: TransactionFieldErrors,
): TransferFormFieldErrors | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  return {
    senderCustomerId: fieldErrors.senderCustomerId,
    receiverCustomerId: fieldErrors.receiverCustomerId,
    currencyCode: fieldErrors.currencyCode,
    amount: fieldErrors.amount,
    reference: fieldErrors.reference,
    notes: fieldErrors.description ?? fieldErrors.notes,
  };
}

export function TransferForm({
  customers,
  currencies,
  onSuccess,
  onCancel,
}: TransferFormProps) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<TransferFormValues>(emptyTransferFormValues);
  const [fieldErrors, setFieldErrors] = useState<TransferFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof TransferFormValues>(
    key: K,
    value: TransferFormValues[K],
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
      const parsed = transferFormSchema.safeParse(form);

      if (!parsed.success) {
        setFieldErrors(toTransferFormFieldErrors(parsed.error));
        setFormError(t.common.correctHighlightedFields);
        return;
      }

      const data = parsed.data;

      const result = await createTransferAction({
        reference: data.reference,
        senderCustomerId: data.senderCustomerId,
        receiverCustomerId: data.receiverCustomerId,
        currencyCode: data.currencyCode,
        amount: data.amount,
        description: data.notes,
      });

      if (!result.ok) {
        setFieldErrors(mapActionFieldErrors(result.fieldErrors) ?? {});
        setFormError(result.message);
        return;
      }

      setSuccessMessage(result.message);
      onSuccess?.(result.message);
      setForm(emptyTransferFormValues());
      router.refresh();
    } catch {
      setFormError(t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <FormSection
        title={onCancel ? undefined : t.transfers.newTransfer}
        description={onCancel ? undefined : t.transfers.emptyHint}
      >
        <FieldGroup>
          <FormGrid columns={2}>
            <Field
              data-invalid={fieldErrors.senderCustomerId ? true : undefined}
            >
              <FieldLabel htmlFor="transfer-senderCustomerId">
                {t.transfers.senderCustomer}
              </FieldLabel>
              <select
                id="transfer-senderCustomerId"
                name="senderCustomerId"
                value={form.senderCustomerId}
                disabled={disabled}
                aria-invalid={
                  fieldErrors.senderCustomerId ? true : undefined
                }
                className={selectClassName}
                onChange={(event) =>
                  updateField("senderCustomerId", event.target.value)
                }
              >
                <option value="">{t.transfers.senderCustomer}</option>
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

            <Field
              data-invalid={
                fieldErrors.receiverCustomerId ? true : undefined
              }
            >
              <FieldLabel htmlFor="transfer-receiverCustomerId">
                {t.transfers.receiverCustomer}
              </FieldLabel>
              <select
                id="transfer-receiverCustomerId"
                name="receiverCustomerId"
                value={form.receiverCustomerId}
                disabled={disabled}
                aria-invalid={
                  fieldErrors.receiverCustomerId ? true : undefined
                }
                className={selectClassName}
                onChange={(event) =>
                  updateField("receiverCustomerId", event.target.value)
                }
              >
                <option value="">{t.transfers.receiverCustomer}</option>
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
          </FormGrid>

          <FormGrid columns={2}>
            <Field
              data-invalid={fieldErrors.currencyCode ? true : undefined}
            >
              <FieldLabel htmlFor="transfer-currencyCode">{t.common.currency}</FieldLabel>
              <select
                id="transfer-currencyCode"
                name="currencyCode"
                value={form.currencyCode}
                disabled={disabled}
                aria-invalid={fieldErrors.currencyCode ? true : undefined}
                className={selectClassName}
                onChange={(event) =>
                  updateField("currencyCode", event.target.value)
                }
              >
                <option value="">{t.transfers.selectCurrency}</option>
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

            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="transfer-amount">{t.common.amount}</FieldLabel>
              <Input
                id="transfer-amount"
                name="amount"
                inputMode="decimal"
                placeholder={t.common.amountPlaceholder}
                value={form.amount}
                disabled={disabled}
                aria-invalid={fieldErrors.amount ? true : undefined}
                onChange={(event) => updateField("amount", event.target.value)}
              />
              {fieldErrors.amount ? (
                <FieldError>{fieldErrors.amount}</FieldError>
              ) : null}
            </Field>
          </FormGrid>

          <Field data-invalid={fieldErrors.reference ? true : undefined}>
            <FieldLabel htmlFor="transfer-reference">{t.common.reference}</FieldLabel>
            <Input
              id="transfer-reference"
              name="reference"
              value={form.reference}
              disabled={disabled}
              aria-invalid={fieldErrors.reference ? true : undefined}
              onChange={(event) =>
                updateField("reference", event.target.value)
              }
            />
            {fieldErrors.reference ? (
              <FieldError>{fieldErrors.reference}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={fieldErrors.notes ? true : undefined}>
            <FieldLabel htmlFor="transfer-notes">{t.common.notes}</FieldLabel>
            <Textarea
              id="transfer-notes"
              name="notes"
              placeholder={t.common.notesOptional}
              value={form.notes}
              disabled={disabled}
              aria-invalid={fieldErrors.notes ? true : undefined}
              onChange={(event) => updateField("notes", event.target.value)}
            />
            {fieldErrors.notes ? (
              <FieldError>{fieldErrors.notes}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
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

      <FormActions>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (onCancel) {
              onCancel();
              return;
            }
            setForm(emptyTransferFormValues());
            setFieldErrors({});
            setFormError(null);
            setSuccessMessage(null);
          }}
        >
          {onCancel ? t.common.cancel : t.common.clear}
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              {t.transfers.posting}
            </>
          ) : (
            t.transfers.newTransfer
          )}
        </Button>
      </FormActions>
    </form>
  );
}
