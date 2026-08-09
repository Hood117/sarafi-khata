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
import { resolveBoardExchangeRate } from "@/features/exchange/domain/resolve-board-rate";
import type {
  ExchangeCurrencyOption,
  ExchangeCustomerOption,
  ExchangeRateOption,
  ExchangeWalletOption,
} from "@/features/exchange/domain/types";
import {
  exchangeFormSchema,
  toExchangeFormFieldErrors,
  type ExchangeCustomerType,
  type ExchangeFormFieldErrors,
} from "@/features/exchange/schemas/exchange-form";
import { invertRateString } from "@/features/transactions/domain/exchange-rate-math";
import {
  createExchangeAction,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
import {
  resolveCashWalletId,
  resolveCustomerWalletId,
} from "@/features/wallets/domain/resolve-form-wallets";
import { useT } from "@/lib/i18n";

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export type ExchangeFormValues = {
  customerType: ExchangeCustomerType;
  customerId: string;
  walkInName: string;
  walkInPhone: string;
  fromWalletId: string;
  toWalletId: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  /** Stronger/higher currency in the pair; rate = low units per 1 high. */
  highCurrencyCode: string;
  amount: string;
  receiveAmount: string;
  exchangeRate: string;
  notes: string;
};

export const emptyExchangeFormValues: ExchangeFormValues = {
  customerType: "existing",
  customerId: "",
  walkInName: "",
  walkInPhone: "",
  fromWalletId: "",
  toWalletId: "",
  fromCurrencyCode: "",
  toCurrencyCode: "",
  highCurrencyCode: "",
  amount: "",
  receiveAmount: "",
  exchangeRate: "",
  notes: "",
};

type ExchangeFormProps = {
  customers: ExchangeCustomerOption[];
  wallets: ExchangeWalletOption[];
  currencies: ExchangeCurrencyOption[];
  rates: ExchangeRateOption[];
  allowManualRateOverride?: boolean;
  onSuccess?: (message: string) => void;
  onCancel?: () => void;
};

function mapActionFieldErrors(
  fieldErrors?: TransactionFieldErrors,
): ExchangeFormFieldErrors | undefined {
  if (!fieldErrors) {
    return undefined;
  }

  return {
    customerId:
      fieldErrors.customerId ??
      fieldErrors.fromWalletId ??
      fieldErrors.toWalletId,
    walkInName: fieldErrors.walkInName,
    walkInPhone: fieldErrors.walkInPhone,
    fromWalletId: undefined,
    toWalletId: undefined,
    fromCurrencyCode: fieldErrors.fromCurrencyCode,
    toCurrencyCode: fieldErrors.toCurrencyCode,
    amount: fieldErrors.amount,
    receiveAmount: fieldErrors.toAmount,
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

function parseCustomerLabel(label: string): { code: string; name: string } {
  const separator = " — ";
  const index = label.indexOf(separator);
  if (index === -1) {
    return { code: "—", name: label };
  }
  return {
    code: label.slice(0, index).trim() || "—",
    name: label.slice(index + separator.length).trim() || "—",
  };
}

function formatCounterAmount(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  const [whole, fraction] = trimmed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction != null && fraction.length > 0
    ? `${grouped}.${fraction}`
    : grouped;
}

/**
 * Pick which currency is "high" (stronger) for the rate convention
 * 1 high = rate low. Prefers board-rate base, else non-AFN, else from.
 */
function resolveDefaultHighCurrency(
  fromCurrencyCode: string,
  toCurrencyCode: string,
  rates: ExchangeRateOption[],
  previousHigh?: string,
): string {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  if (!from || !to || from === to) {
    return "";
  }

  const previous = previousHigh?.trim().toUpperCase() ?? "";
  if (previous === from || previous === to) {
    return previous;
  }

  const board = resolveBoardExchangeRate(rates, from, to);
  if (board) {
    return board.baseCurrencyCode;
  }

  if (from === "AFN" && to !== "AFN") {
    return to;
  }
  if (to === "AFN" && from !== "AFN") {
    return from;
  }

  return from;
}

function resolveHighLowOperation(
  fromCurrencyCode: string,
  toCurrencyCode: string,
  highCurrencyCode: string,
): "multiply" | "divide" | null {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  const high = highCurrencyCode.trim().toUpperCase();
  if (!from || !to || from === to || !high) {
    return null;
  }
  if (high !== from && high !== to) {
    return null;
  }
  // High → low: multiply. Low → high: divide.
  return from === high ? "multiply" : "divide";
}

export function ExchangeForm({
  customers,
  wallets,
  currencies,
  rates,
  allowManualRateOverride = true,
  onSuccess,
  onCancel,
}: ExchangeFormProps) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<ExchangeFormValues>(emptyExchangeFormValues);
  const [fieldErrors, setFieldErrors] = useState<ExchangeFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fromCurrency = currencyByCode(currencies, form.fromCurrencyCode);
  const toCurrency = currencyByCode(currencies, form.toCurrencyCode);
  const selectedCustomer = customers.find(
    (customer) => customer.id === form.customerId,
  );
  const selectedCustomerParts = selectedCustomer
    ? parseCustomerLabel(selectedCustomer.label)
    : null;

  const boardRate = useMemo(
    () =>
      resolveBoardExchangeRate(
        rates,
        form.fromCurrencyCode,
        form.toCurrencyCode,
      ),
    [form.fromCurrencyCode, form.toCurrencyCode, rates],
  );

  const effectiveBoardRate =
    form.exchangeRate.trim() || boardRate?.boardRate || "";

  const lowCurrencyCode =
    form.fromCurrencyCode &&
    form.toCurrencyCode &&
    form.highCurrencyCode &&
    form.highCurrencyCode === form.fromCurrencyCode
      ? form.toCurrencyCode
      : form.highCurrencyCode === form.toCurrencyCode
        ? form.fromCurrencyCode
        : "";

  const rateOperation = useMemo(
    () =>
      resolveHighLowOperation(
        form.fromCurrencyCode,
        form.toCurrencyCode,
        form.highCurrencyCode,
      ),
    [form.fromCurrencyCode, form.toCurrencyCode, form.highCurrencyCode],
  );

  const dealRateToPerFrom = useMemo(() => {
    const boardValue = effectiveBoardRate.trim();

    if (!boardValue) {
      return "";
    }

    if (rateOperation === "multiply") {
      return boardValue;
    }

    if (rateOperation === "divide") {
      try {
        return invertRateString(boardValue);
      } catch {
        return boardRate?.dealRateToPerFrom ?? "";
      }
    }

    // Unknown orientation: treat entered rate as to-units per 1 from-unit.
    return boardValue;
  }, [boardRate, effectiveBoardRate, rateOperation]);

  const resultAmount = useMemo(() => {
    if (!fromCurrency || !toCurrency || !dealRateToPerFrom) {
      return "";
    }

    return (
      previewConvertedAmount({
        amountMajor: form.amount,
        fromCurrencyCode: fromCurrency.code,
        fromDecimalPlaces: fromCurrency.decimalPlaces,
        toCurrencyCode: toCurrency.code,
        toDecimalPlaces: toCurrency.decimalPlaces,
        rate: dealRateToPerFrom,
      }) ?? ""
    );
  }, [dealRateToPerFrom, form.amount, fromCurrency, toCurrency]);

  function resolveWallets(values: {
    customerType: ExchangeCustomerType;
    customerId: string;
  }): {
    fromWalletId: string;
    toWalletId: string;
    error: string | null;
    errorField: "customerId" | "walkInName" | null;
  } {
    if (values.customerType === "existing") {
      if (!values.customerId) {
        return {
          fromWalletId: "",
          toWalletId: "",
          error: null,
          errorField: null,
        };
      }

      const resolved = resolveCustomerWalletId(wallets, values.customerId);
      if (!resolved.ok) {
        return {
          fromWalletId: "",
          toWalletId: "",
          error: resolved.message,
          errorField: "customerId",
        };
      }

      return {
        fromWalletId: resolved.walletId,
        toWalletId: resolved.walletId,
        error: null,
        errorField: null,
      };
    }

    const resolved = resolveCashWalletId(wallets);
    if (!resolved.ok) {
      return {
        fromWalletId: "",
        toWalletId: "",
        error: resolved.message,
        errorField: "walkInName",
      };
    }

    return {
      fromWalletId: resolved.walletId,
      toWalletId: resolved.walletId,
      error: null,
      errorField: null,
    };
  }

  function updateField<K extends keyof ExchangeFormValues>(
    key: K,
    value: ExchangeFormValues[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "customerType") {
        const customerType = value as ExchangeCustomerType;
        next.customerType = customerType;
        if (customerType === "existing") {
          next.walkInName = "";
          next.walkInPhone = "";
        } else {
          next.customerId = "";
        }
        const applied = resolveWallets({
          customerType,
          customerId: next.customerId,
        });
        next.fromWalletId = applied.fromWalletId;
        next.toWalletId = applied.toWalletId;
      }

      if (key === "customerId") {
        const applied = resolveWallets({
          customerType: next.customerType,
          customerId: typeof value === "string" ? value : "",
        });
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
        const resolvedBoard = resolveBoardExchangeRate(rates, fromCode, toCode);
        next.exchangeRate = resolvedBoard?.boardRate ?? "";
        next.highCurrencyCode = resolveDefaultHighCurrency(
          fromCode,
          toCode,
          rates,
          next.highCurrencyCode,
        );
      }

      return next;
    });

    setFieldErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "customerType" || key === "customerId"
        ? {
            customerId: undefined,
            walkInName: undefined,
            walkInPhone: undefined,
            fromWalletId: undefined,
            toWalletId: undefined,
          }
        : {}),
      ...(key === "fromCurrencyCode" || key === "toCurrencyCode"
        ? { exchangeRate: undefined, receiveAmount: undefined }
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
      const applied = resolveWallets({
        customerType: form.customerType,
        customerId: form.customerId,
      });
      if (applied.error) {
        setFieldErrors({
          [applied.errorField ?? "customerId"]: applied.error,
        });
        setFormError(applied.error);
        return;
      }

      if (!effectiveBoardRate.trim()) {
        setFieldErrors({
          exchangeRate: t.exchange.rate,
        });
        setFormError(t.common.correctHighlightedFields);
        return;
      }

      if (!resultAmount) {
        setFieldErrors({
          amount: t.common.amount,
          receiveAmount: t.exchange.result,
        });
        setFormError(t.common.correctHighlightedFields);
        return;
      }

      const values: ExchangeFormValues = {
        ...form,
        fromWalletId: applied.fromWalletId,
        toWalletId: applied.toWalletId,
        exchangeRate: effectiveBoardRate,
        receiveAmount: resultAmount,
      };
      setForm(values);

      const parsed = exchangeFormSchema.safeParse(values);

      if (!parsed.success) {
        setFieldErrors(toExchangeFormFieldErrors(parsed.error));
        setFormError(t.common.correctHighlightedFields);
        return;
      }

      const data = parsed.data;

      const result = await createExchangeAction({
        reference: createExchangeReference(),
        customerId: data.customerType === "existing" ? data.customerId : null,
        walkInName: data.customerType === "walk_in" ? data.walkInName : null,
        walkInPhone: data.customerType === "walk_in" ? data.walkInPhone : null,
        fromWalletId: data.fromWalletId,
        toWalletId: data.toWalletId,
        fromCurrencyCode: data.fromCurrencyCode,
        toCurrencyCode: data.toCurrencyCode,
        amount: data.amount,
        toAmount: data.receiveAmount,
        description: data.notes,
      });

      if (!result.ok) {
        setFieldErrors(mapActionFieldErrors(result.fieldErrors) ?? {});
        setFormError(result.message);
        return;
      }

      setSuccessMessage(result.message);
      onSuccess?.(result.message);
      setForm(emptyExchangeFormValues);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t.common.error,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <FormSection
        title={t.wallets.customer}
        description={t.exchange.customerOptional}
      >
        <FieldGroup>
          <Field data-invalid={fieldErrors.customerType ? true : undefined}>
            <FieldLabel>{t.common.type}</FieldLabel>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="customerType"
                  value="existing"
                  checked={form.customerType === "existing"}
                  disabled={disabled}
                  onChange={() => updateField("customerType", "existing")}
                />
                {t.exchange.existingCustomer}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="customerType"
                  value="walk_in"
                  checked={form.customerType === "walk_in"}
                  disabled={disabled}
                  onChange={() => updateField("customerType", "walk_in")}
                />
                {t.exchange.walkInCustomer}
              </label>
            </div>
            {fieldErrors.customerType ? (
              <FieldError>{fieldErrors.customerType}</FieldError>
            ) : null}
          </Field>

          {form.customerType === "existing" ? (
            <>
              <Field data-invalid={fieldErrors.customerId ? true : undefined}>
                <FieldLabel htmlFor="exchange-customerId">
                  {t.wallets.customer}
                </FieldLabel>
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
                  <option value="">{t.wallets.selectCustomer}</option>
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
                <Field>
                  <FieldLabel htmlFor="exchange-customerCode">
                    {t.common.reference}
                  </FieldLabel>
                  <Input
                    id="exchange-customerCode"
                    value={selectedCustomerParts?.code ?? ""}
                    readOnly
                    disabled
                    placeholder="—"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="exchange-customerName">
                    {t.common.name}
                  </FieldLabel>
                  <Input
                    id="exchange-customerName"
                    value={selectedCustomerParts?.name ?? ""}
                    readOnly
                    disabled
                    placeholder="—"
                  />
                </Field>
              </FormGrid>
            </>
          ) : (
            <FormGrid columns={2}>
              <Field data-invalid={fieldErrors.walkInName ? true : undefined}>
                <FieldLabel htmlFor="exchange-walkInName">{t.common.name}</FieldLabel>
                <Input
                  id="exchange-walkInName"
                  name="walkInName"
                  placeholder={t.exchange.walkInName}
                  value={form.walkInName}
                  disabled={disabled}
                  aria-invalid={fieldErrors.walkInName ? true : undefined}
                  onChange={(event) =>
                    updateField("walkInName", event.target.value)
                  }
                />
                {fieldErrors.walkInName ? (
                  <FieldError>{fieldErrors.walkInName}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={fieldErrors.walkInPhone ? true : undefined}>
                <FieldLabel htmlFor="exchange-walkInPhone">
                  {t.common.phone}
                </FieldLabel>
                <Input
                  id="exchange-walkInPhone"
                  name="walkInPhone"
                  placeholder={t.common.phone}
                  value={form.walkInPhone}
                  disabled={disabled}
                  aria-invalid={fieldErrors.walkInPhone ? true : undefined}
                  onChange={(event) =>
                    updateField("walkInPhone", event.target.value)
                  }
                />
                {fieldErrors.walkInPhone ? (
                  <FieldError>{fieldErrors.walkInPhone}</FieldError>
                ) : null}
              </Field>
            </FormGrid>
          )}
        </FieldGroup>
      </FormSection>

      <FormSection
        title={t.pages.exchange}
        description={t.exchange.whichHigher}
      >
        <FieldGroup>
          <FormGrid columns={2}>
            <Field
              data-invalid={fieldErrors.fromCurrencyCode ? true : undefined}
            >
              <FieldLabel htmlFor="exchange-fromCurrencyCode">
                {t.exchange.fromCurrency}
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
                <option value="">{t.exchange.fromCurrency}</option>
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
                {t.exchange.toCurrency}
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
                <option value="">{t.exchange.toCurrency}</option>
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

          {form.fromCurrencyCode &&
          form.toCurrencyCode &&
          form.fromCurrencyCode !== form.toCurrencyCode ? (
            <Field>
              <FieldLabel>{t.exchange.whichHigher}</FieldLabel>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="highCurrencyCode"
                    value={form.fromCurrencyCode}
                    checked={form.highCurrencyCode === form.fromCurrencyCode}
                    disabled={disabled}
                    onChange={() =>
                      updateField("highCurrencyCode", form.fromCurrencyCode)
                    }
                  />
                  {form.fromCurrencyCode} is high
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="highCurrencyCode"
                    value={form.toCurrencyCode}
                    checked={form.highCurrencyCode === form.toCurrencyCode}
                    disabled={disabled}
                    onChange={() =>
                      updateField("highCurrencyCode", form.toCurrencyCode)
                    }
                  />
                  {form.toCurrencyCode} is high
                </label>
              </div>
              <Typography variant="caption">
                {form.highCurrencyCode && lowCurrencyCode
                  ? `Rate means: 1 ${form.highCurrencyCode} = ___ ${lowCurrencyCode}. ${
                      rateOperation === "multiply"
                        ? `${form.fromCurrencyCode} → ${form.toCurrencyCode}: multiply by rate`
                        : rateOperation === "divide"
                          ? `${form.fromCurrencyCode} → ${form.toCurrencyCode}: divide by rate`
                          : "Select which currency is higher."
                    }`
                  : "Select which currency is higher so the system knows whether to multiply or divide."}
              </Typography>
            </Field>
          ) : null}

          <FormGrid columns={2}>
            <Field data-invalid={fieldErrors.amount ? true : undefined}>
              <FieldLabel htmlFor="exchange-amount">{t.common.amount}</FieldLabel>
              <Input
                id="exchange-amount"
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

            <Field data-invalid={fieldErrors.exchangeRate ? true : undefined}>
              <FieldLabel htmlFor="exchange-exchangeRate">
                {form.highCurrencyCode && lowCurrencyCode
                  ? `${t.exchange.rate} (1 ${form.highCurrencyCode} = ? ${lowCurrencyCode})`
                  : t.exchange.rate}
              </FieldLabel>
              <Input
                id="exchange-exchangeRate"
                name="exchangeRate"
                inputMode="decimal"
                placeholder="Enter today’s rate"
                value={form.exchangeRate}
                disabled={disabled || !allowManualRateOverride}
                readOnly={!allowManualRateOverride}
                aria-invalid={fieldErrors.exchangeRate ? true : undefined}
                onChange={(event) =>
                  updateField("exchangeRate", event.target.value)
                }
              />
              <Typography variant="caption">
                {boardRate
                  ? `Board suggests ${boardRate.displayLabel}. Edit today’s rate if different.`
                  : form.fromCurrencyCode &&
                      form.toCurrencyCode &&
                      form.fromCurrencyCode !== form.toCurrencyCode
                    ? "Enter today’s board rate for 1 high = X low."
                    : "Select from and to currencies, then enter today’s rate."}
              </Typography>
              {fieldErrors.exchangeRate ? (
                <FieldError>{fieldErrors.exchangeRate}</FieldError>
              ) : null}
            </Field>
          </FormGrid>

          <Field data-invalid={fieldErrors.receiveAmount ? true : undefined}>
            <FieldLabel htmlFor="exchange-result">{t.exchange.result}</FieldLabel>
            <Input
              id="exchange-result"
              name="result"
              value={
                resultAmount && toCurrency
                  ? `${formatCounterAmount(resultAmount)} ${toCurrency.code}`
                  : resultAmount
              }
              readOnly
              disabled
              placeholder="—"
              aria-readonly="true"
            />
            {fieldErrors.receiveAmount ? (
              <FieldError>{fieldErrors.receiveAmount}</FieldError>
            ) : null}
          </Field>

          {form.amount && resultAmount && fromCurrency && toCurrency ? (
            <div
              className="bg-muted/40 space-y-1 rounded-lg px-3 py-2"
              aria-live="polite"
            >
              <Typography variant="muted">
                {t.common.from}: {formatCounterAmount(form.amount)}{" "}
                {fromCurrency.code}
              </Typography>
              <Typography variant="h4" className="font-semibold tabular-nums">
                {t.exchange.result}: {formatCounterAmount(resultAmount)}{" "}
                {toCurrency.code}
              </Typography>
              {rateOperation && form.highCurrencyCode && lowCurrencyCode ? (
                <Typography variant="caption">
                  {rateOperation === "multiply" ? "×" : "÷"}{" "}
                  {effectiveBoardRate} (1 {form.highCurrencyCode} ={" "}
                  {effectiveBoardRate} {lowCurrencyCode})
                </Typography>
              ) : null}
            </div>
          ) : null}

          <Field data-invalid={fieldErrors.notes ? true : undefined}>
            <FieldLabel htmlFor="exchange-notes">{t.common.notes}</FieldLabel>
            <Textarea
              id="exchange-notes"
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
            setForm(emptyExchangeFormValues);
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
              {t.common.posting}
            </>
          ) : (
            t.exchange.newExchange
          )}
        </Button>
      </FormActions>
    </form>
  );
}
