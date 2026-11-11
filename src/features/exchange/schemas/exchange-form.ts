import { z } from "zod";

import { isPositiveRateString } from "@/features/exchange-rates/domain/rate";
import { optionalPhoneSchema, positiveAmountSchema } from "@/lib/validation";

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

const amountSchema = positiveAmountSchema;

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

function optionalPartyText(maxLength: number) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

export const exchangeCustomerTypeSchema = z.enum(["existing", "walk_in"]);

export type ExchangeCustomerType = z.infer<typeof exchangeCustomerTypeSchema>;

export const exchangeFormSchema = z
  .object({
    customerType: exchangeCustomerTypeSchema,
    customerId: z.preprocess(
      (value) => {
        if (value == null) {
          return null;
        }
        if (typeof value !== "string") {
          return value;
        }
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().trim().min(1).nullable(),
    ),
    walkInName: optionalPartyText(200),
    walkInPhone: optionalPhoneSchema,
    fromWalletId: walletIdSchema,
    toWalletId: walletIdSchema,
    fromCurrencyCode: currencyCodeSchema,
    toCurrencyCode: currencyCodeSchema,
    amount: amountSchema,
    /** Calculated receive amount (result). */
    receiveAmount: amountSchema,
    /** Board rate used for the conversion (quote per 1 base). */
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

    if (data.customerType === "existing") {
      if (!data.customerId) {
        context.addIssue({
          code: "custom",
          path: ["customerId"],
          message: "Customer is required.",
        });
      }
    } else if (data.customerId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Walk-in exchange must not select a registered customer.",
      });
    }
  });

export type ExchangeFormSchemaInput = z.input<typeof exchangeFormSchema>;
export type ExchangeFormSchemaOutput = z.output<typeof exchangeFormSchema>;

export type ExchangeFormFieldErrors = Partial<
  Record<
    | "customerType"
    | "customerId"
    | "walkInName"
    | "walkInPhone"
    | "fromWalletId"
    | "toWalletId"
    | "fromCurrencyCode"
    | "toCurrencyCode"
    | "amount"
    | "receiveAmount"
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
      (key === "customerType" ||
        key === "customerId" ||
        key === "walkInName" ||
        key === "walkInPhone" ||
        key === "fromWalletId" ||
        key === "toWalletId" ||
        key === "fromCurrencyCode" ||
        key === "toCurrencyCode" ||
        key === "amount" ||
        key === "receiveAmount" ||
        key === "exchangeRate" ||
        key === "notes") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
