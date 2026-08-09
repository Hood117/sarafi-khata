import { z } from "zod";

import {
  isPositiveRateString,
  normalizeRateString,
} from "@/features/exchange-rates/domain/rate";

const currencyIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Currency is required." });

const rateSchema = z
  .string()
  .trim()
  .min(1, { error: "Rate is required." })
  .superRefine((value, context) => {
    if (!isPositiveRateString(value)) {
      context.addIssue({
        code: "custom",
        message: "Rate must be a positive number (e.g. 70 or 70.5).",
      });
      return;
    }

    try {
      normalizeRateString(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Rate must have at most 8 decimal places.",
      });
    }
  })
  .transform((value) => normalizeRateString(value));

const effectiveDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "Effective date must be YYYY-MM-DD.",
  });

export const createExchangeRateSchema = z
  .object({
    baseCurrencyId: currencyIdSchema,
    quoteCurrencyId: currencyIdSchema,
    rate: rateSchema,
    effectiveDate: effectiveDateSchema,
    isActive: z.boolean(),
  })
  .superRefine((data, context) => {
    if (data.baseCurrencyId === data.quoteCurrencyId) {
      context.addIssue({
        code: "custom",
        path: ["quoteCurrencyId"],
        message: "Quote currency must be different from base currency.",
      });
    }
  });

/** Same fields as create — rates are editable master data (not ledger postings). */
export const updateExchangeRateSchema = createExchangeRateSchema;

export type CreateExchangeRateSchemaInput = z.input<
  typeof createExchangeRateSchema
>;
export type CreateExchangeRateSchemaOutput = z.output<
  typeof createExchangeRateSchema
>;
export type UpdateExchangeRateSchemaOutput = z.output<
  typeof updateExchangeRateSchema
>;

export type ExchangeRateFormFieldErrors = Partial<
  Record<
    | "baseCurrencyId"
    | "quoteCurrencyId"
    | "rate"
    | "effectiveDate"
    | "isActive",
    string
  >
>;

export function toExchangeRateFormFieldErrors(
  error: z.ZodError,
): ExchangeRateFormFieldErrors {
  const fieldErrors: ExchangeRateFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "baseCurrencyId" ||
        key === "quoteCurrencyId" ||
        key === "rate" ||
        key === "effectiveDate" ||
        key === "isActive") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
