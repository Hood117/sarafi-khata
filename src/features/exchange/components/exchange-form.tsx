"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

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
import { Typography } from "@/design-system/typography";
import { createExchangeReference } from "@/features/exchange/domain/create-exchange-reference";
import { previewConvertedAmount } from "@/features/exchange/domain/preview-conversion";
import { resolveFormDealRate } from "@/features/exchange/domain/resolve-form-rate";
import type {
  ExchangeCurrencyOption,
  ExchangeCustomerOption,
  ExchangeRateOption,
  ExchangeWalletOption,
} from "@/features/exchange/domain/types";
import {
  exchangeFormSchema,
  toExchangeFormFieldErrors,
  type ExchangeFormFieldErrors,
} from "@/features/exchange/schemas/exchange-form";
import {
  createExchangeAction,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
import { resolveCustomerWalletId } from "@/features/wallets/domain/resolve-form-wallets";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type ExchangeFormValues = {
  customerId: string;
  fromWalletId: string;
  toWalletId: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  amount: string;
  exchangeRate: string;
  notes: string;
};

export const emptyExchangeFormValues: ExchangeFormValues = {
  customerId: "",
  fromWalletId: "",
  toWalletId: "",
  fromCurrencyCode: "",
  toCurrencyCode: "",
  amount: "",
  exchangeRate: "",
  notes: "",
};

type ExchangeFormProps = {
  customers: ExchangeCustomerOption[];
  wallets: ExchangeWalletOption[];
  currencies: ExchangeCurrencyOption[];
  rates: ExchangeRateOption[];
  allowManualRateOverride: boolean;
  onSuccess?: (message: string) => void;
};

function mapActionFieldErrors(
  fieldErrors?: TransactionFieldErrors,
): ExchangeFormFieldErrors | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  // Wallet fields are hidden — surface wallet issues on the customer field.
  return {
    customerId:
      fieldErrors.customerId ??
      fieldErrors.fromWalletId ??
      fieldErrors.toWalletId,
    fromWalletId: undefined,
    toWalletId: undefined,
    fromCurrencyCode: fieldErrors.fromCurrencyCode,
    toCurrencyCode: fieldErrors.toCurrencyCode,
    amount: fieldErrors.amount,
    exchangeRate: fieldErrors.manualRate,
    notes: fieldErrors.description ?? fieldErrors.notes,
  };
}

function currencyByCode(
  currencies: ExchangeCurrencyOption[],
  code: string,
): ExchangeCurrencyOption | undefined {
  return currencies.find((currency) => currency.code === code);
}

export function ExchangeForm({
  customers,
  wallets,
  currencies,
  rates,
  allowManualRateOverride,
  onSuccess,
}: ExchangeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ExchangeFormValues>(emptyExchangeFormValues);
  const [rateTouched, setRateTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ExchangeFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fromCurrency = currencyByCode(currencies, form.fromCurrencyCode);
  const toCurrency = currencyByCode(currencies, form.toCurrencyCode);

  const marketRate = useMemo(
    () =>
      resolveFormDealRate(
        rates,
        form.fromCurrencyCode,
        form.toCurrencyCode,
      )?.rate ?? null,
    [form.fromCurrencyCode, form.toCurrencyCode, rates],
  );

  const effectiveRate =
    rateTouched && allowManualRateOverride
      ? form.exchangeRate
      : (marketRate ?? form.exchangeRate);

  const convertedAmount = useMemo(() => {
    if (!fromCurrency || !toCurrency) {
      return "";
    }

    return (
      previewConvertedAmount({
        amountMajor: form.amount,
        fromCurrencyCode: fromCurrency.code,
        fromDecimalPlaces: fromCurrency.decimalPlaces,
        toCurrencyCode: toCurrency.code,
        toDecimalPlaces: toCurrency.decimalPlaces,
        rate: effectiveRate,
      }) ?? ""
    );
  }, [effectiveRate, form.amount, fromCurrency, toCurrency]);

  function applyCustomerWallet(customerId: string): {
    fromWalletId: string;
    toWalletId: string;
    error: string | null;
  } {
    if (!customerId) {
      return { fromWalletId: "", toWalletId: "", error: null };
    }

    const resolved = resolveCustomerWalletId(wallets, customerId);
    if (!resolved.ok) {
      return { fromWalletId: "", toWalletId: "", error: resolved.message };
    }

    return {
      fromWalletId: resolved.walletId,
      toWalletId: resolved.walletId,
      error: null,
    };
  }

  function updateField<K extends keyof ExchangeFormValues>(
    key: K,
    value: ExchangeFormValues[K],
  ) {
    if (key === "fromCurrencyCode" || key === "toCurrencyCode") {
      setRateTouched(false);
    }

    if (key === "exchangeRate") {
      setRateTouched(true);
    }

    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "customerId") {
        const applied = applyCustomerWallet(
          typeof value === "string" ? value : "",
        );
        next.fromWalletId = applied.fromWalletId;
        next.toWalletId = applied.toWalletId;
      }

      if (key === "fromCurrencyCode" || key === "toCurrencyCode") {
        const fromCode =
          key === "fromCurrencyCode"
            ? String(value)
            : next.fromCurrencyCode;
        const toCode =
          key === "toCurrencyCode" ? String(value) : next.toCurrencyCode;
        next.exchangeRate =
          resolveFormDealRate(rates, fromCode, toCode)?.rate ?? "";
      }

      return next;
    });

    setFieldErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "customerId"
        ? { fromWalletId: undefined, toWalletId: undefined }
        : {}),
      ...(key === "fromCurrencyCode" || key === "toCurrencyCode"
        ? { exchangeRate: undefined }
        : {}),
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
      const applied = applyCustomerWallet(form.customerId);
      if (applied.error) {
        setFieldErrors({ customerId: applied.error });
        setFormError(applied.error);
        return;
      }

      const values: ExchangeFormValues = {
        ...form,
        fromWalletId: applied.fromWalletId,
        toWalletId: applied.toWalletId,
        exchangeRate: effectiveRate,
      };
      setForm(values);

      const parsed = exchangeFormSchema.safeParse(values);

      if (!parsed.success) {
        setFieldErrors(toExchangeFormFieldErrors(parsed.error));
        setFormError("Please correct the highlighted fields.");
        return;
      }

      const data = parsed.data;
      const submittedRate = data.exchangeRate;
      const rateEdited =
        allowManualRateOverride &&
        (rateTouched ||
          (marketRate != null && submittedRate !== marketRate) ||
          marketRate == null);

      const result = await createExchangeAction({
        reference: createExchangeReference(),
        customerId: data.customerId,
        fromWalletId: data.fromWalletId,
        toWalletId: data.toWalletId,
        fromCurrencyCode: data.fromCurrencyCode,
        toCurrencyCode: data.toCurrencyCode,
        amount: data.amount,
        description: data.notes,
        allowManualRateOverride: rateEdited,
        manualRate: rateEdited ? submittedRate : null,
      });

      if (!result.ok) {
        setFieldErrors(mapActionFieldErrors(result.fieldErrors) ?? {});
        setFormError(result.message);
        return;
      }

      setSuccessMessage(result.message);
      onSuccess?.(result.message);
      setForm(emptyExchangeFormValues);
      setRateTouched(false);
      router.refresh();
    } catch {
      setFormError("Unable to post exchange. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting;
  const rateReadOnly = !allowManualRateOverride;
  const rateHint =
    form.fromCurrencyCode &&
    form.toCurrencyCode &&
    form.fromCurrencyCode !== form.toCurrencyCode
      ? marketRate
        ? `Market: 1 ${form.fromCurrencyCode} = ${marketRate} ${form.toCurrencyCode}`
        : "No active rate for this pair in Settings → Exchange Rates."
      : "Select two different currencies to load today’s rate.";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <FormSection
        title="Currency exchange"
        description="Convert one currency into another. Rates load from Settings; the customer’s account is updated automatically."
      >
        <FieldGroup>
          <Field data-invalid={fieldErrors.customerId ? true : undefined}>
            <FieldLabel htmlFor="exchange-customerId">Customer</FieldLabel>
            <select
              id="exchange-customerId"
              name="customerId"
              value={form.customerId}
              disabled={disabled}
              aria-invalid={fieldErrors.customerId ? true : undefined}
              className={selectClassName}
              onChange={(event) =>
                updateField("customerId", event.target.value)
              }
            >
              <option value="">Select a customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
            {fieldErrors.customerId ? (
              <FieldError>{fieldErrors.customerId}</FieldError>
            ) : null}
          </Field>

          <FormGrid columns={2}>
            <Field
              data-invalid={fieldErrors.fromCurrencyCode ? true : undefined}
            >
              <FieldLabel htmlFor="exchange-fromCurrencyCode">
                From Currency
              </FieldLabel>
              <select
                id="exchange-fromCurrencyCode"
                name="fromCurrencyCode"
                value={form.fromCurrencyCode}
                disabled={disabled}
                aria-invalid={fieldErrors.fromCurrencyCode ? true : undefined}
                className={selectClassName}
                onChange={(event) =>
                  updateField("fromCurrencyCode", event.target.value)
                }
              >
                <option value="">Select from currency</option>
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {fieldErrors.fromCurrencyCode ? (
                <FieldError>{fieldErrors.fromCurrencyCode}</FieldError>
              ) : null}
            </Field>

            <Field
              data-invalid={fieldErrors.toCurrencyCode ? true : undefined}
            >
              <FieldLabel htmlFor="exchange-toCurrencyCode">
                To Currency
              </FieldLabel>
              <select
                id="exchange-toCurrencyCode"
                name="toCurrencyCode"
                value={form.toCurrencyCode}
                disabled={disabled}
                aria-invalid={fieldErrors.toCurrencyCode ? true : undefined}
                className={selectClassName}
                onChange={(event) =>
                  updateField("toCurrencyCode", event.target.value)
                }
              >
                <option value="">Select to currency</option>
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {fieldErrors.toCurrencyCode ? (
                <FieldError>{fieldErrors.toCurrencyCode}</FieldError>
              ) : null}
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="exchange-amount">Amount</FieldLabel>
              <Input
                id="exchange-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                disabled={disabled}
                aria-invalid={fieldErrors.amount ? true : undefined}
                onChange={(event) => updateField("amount", event.target.value)}
              />
              {fieldErrors.amount ? (
                <FieldError>{fieldErrors.amount}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={fieldErrors.exchangeRate ? true : undefined}>
              <FieldLabel htmlFor="exchange-exchangeRate">
                Exchange Rate
              </FieldLabel>
              <Input
                id="exchange-exchangeRate"
                name="exchangeRate"
                inputMode="decimal"
                placeholder="0.00"
                value={effectiveRate}
                disabled={disabled || rateReadOnly}
                readOnly={rateReadOnly}
                aria-invalid={fieldErrors.exchangeRate ? true : undefined}
                onChange={(event) =>
                  updateField("exchangeRate", event.target.value)
                }
              />
              <Typography variant="caption">
                {rateHint}
                {rateReadOnly
                  ? " Manual editing is disabled by business rules."
                  : null}
              </Typography>
              {fieldErrors.exchangeRate ? (
                <FieldError>{fieldErrors.exchangeRate}</FieldError>
              ) : null}
            </Field>
          </FormGrid>

          <Field>
            <FieldLabel htmlFor="exchange-convertedAmount">
              Converted Amount
            </FieldLabel>
            <Input
              id="exchange-convertedAmount"
              name="convertedAmount"
              value={
                convertedAmount
                  ? toCurrency
                    ? `${convertedAmount} ${toCurrency.code}`
                    : convertedAmount
                  : ""
              }
              readOnly
              disabled
              placeholder="—"
            />
          </Field>

          <Field data-invalid={fieldErrors.notes ? true : undefined}>
            <FieldLabel htmlFor="exchange-notes">Notes</FieldLabel>
            <Textarea
              id="exchange-notes"
              name="notes"
              placeholder="Optional notes"
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
            setForm(emptyExchangeFormValues);
            setRateTouched(false);
            setFieldErrors({});
            setFormError(null);
            setSuccessMessage(null);
          }}
        >
          Clear
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Posting...
            </>
          ) : (
            "Create Exchange"
          )}
        </Button>
      </FormActions>
    </form>
  );
}
