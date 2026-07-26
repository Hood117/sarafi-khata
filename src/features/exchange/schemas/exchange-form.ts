import { z } from "zod";

import { isPositiveRateString } from "@/features/exchange-rates/domain/rate";

const walletIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Wallet is required." });

const currencyCodeSchema = z
  .string()
  .trim()
  .min(1, { error: "Currency is required." })
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3,8}$/.test(value), {
    error: "Currency code is invalid.",
  });

const amountSchema = z
  .string()
  .trim()
  .min(1, { error: "Amount is required." })
  .refine((value) => /^\d+(\.\d+)?$/.test(value), {
    error: "Amount must be a positive number.",
  })
  .refine((value) => Number(value) > 0, {
    error: "Amount must be greater than zero.",
  });

const exchangeRateSchema = z
  .string()
  .trim()
  .min(1, { error: "Exchange rate is required." })
  .refine((value) => isPositiveRateString(value), {
    error: "Exchange rate must be greater than zero.",
  });

function optionalNotes() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(2000, { error: "Must be at most 2000 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

export const exchangeFormSchema = z
  .object({
    customerId: z.string().trim().min(1, { error: "Customer is required." }),
    fromWalletId: walletIdSchema,
    toWalletId: walletIdSchema,
    fromCurrencyCode: currencyCodeSchema,
    toCurrencyCode: currencyCodeSchema,
    amount: amountSchema,
    exchangeRate: exchangeRateSchema,
    notes: optionalNotes(),
  })
  .superRefine((data, context) => {
    if (data.fromCurrencyCode === data.toCurrencyCode) {
      context.addIssue({
        code: "custom",
        path: ["toCurrencyCode"],
        message: "To currency must be different from from currency.",
      });
    }
  });

export type ExchangeFormSchemaInput = z.input<typeof exchangeFormSchema>;
export type ExchangeFormSchemaOutput = z.output<typeof exchangeFormSchema>;

export type ExchangeFormFieldErrors = Partial<
  Record<
    | "customerId"
    | "fromWalletId"
    | "toWalletId"
    | "fromCurrencyCode"
    | "toCurrencyCode"
    | "amount"
    | "exchangeRate"
    | "notes",
    string
  >
>;

export function toExchangeFormFieldErrors(
  error: z.ZodError,
): ExchangeFormFieldErrors {
  const fieldErrors: ExchangeFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "customerId" ||
        key === "fromWalletId" ||
        key === "toWalletId" ||
        key === "fromCurrencyCode" ||
        key === "toCurrencyCode" ||
        key === "amount" ||
        key === "exchangeRate" ||
        key === "notes") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
