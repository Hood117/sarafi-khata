import { z } from "zod";

function optionalText(maxLength = 2000) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

const referenceSchema = z
  .string()
  .trim()
  .min(1, { error: "Reference is required." })
  .max(100, { error: "Reference must be at most 100 characters." });

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

/** Major-unit decimal string, e.g. "100.50". */
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

const valueDateSchema = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }
  if (value == null || value === "") {
    return new Date();
  }
  if (typeof value === "string" && value.trim() !== "") {
    return new Date(value);
  }
  return value;
}, z.date({ error: "A valid value date is required." }));

export const depositSchema = z.object({
  reference: referenceSchema,
  customerWalletId: walletIdSchema,
  cashWalletId: walletIdSchema,
  currencyCode: currencyCodeSchema,
  amount: amountSchema,
  valueDate: valueDateSchema.optional(),
  description: optionalText(2000),
});

export const withdrawalSchema = z.object({
  reference: referenceSchema,
  customerWalletId: walletIdSchema,
  cashWalletId: walletIdSchema,
  currencyCode: currencyCodeSchema,
  amount: amountSchema,
  valueDate: valueDateSchema.optional(),
  description: optionalText(2000),
});

export const manualAdjustmentSchema = z.object({
  reference: referenceSchema,
  debitWalletId: walletIdSchema,
  creditWalletId: walletIdSchema,
  currencyCode: currencyCodeSchema,
  amount: amountSchema,
  valueDate: valueDateSchema.optional(),
  description: optionalText(2000),
  customerId: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().nullable(),
  ),
});

/** Optional manual FX rate: to-currency units per 1 from-currency unit. */
const optionalManualRateSchema = z.preprocess(
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
  z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, {
      error: "Exchange rate must be a positive number.",
    })
    .refine((value) => Number(value) > 0, {
      error: "Exchange rate must be greater than zero.",
    })
    .nullable(),
);

export const exchangeSchema = z
  .object({
    reference: referenceSchema,
    customerId: z.string().trim().min(1, { error: "Customer is required." }),
    fromWalletId: walletIdSchema,
    toWalletId: walletIdSchema,
    fromCurrencyCode: currencyCodeSchema,
    toCurrencyCode: currencyCodeSchema,
    amount: amountSchema,
    valueDate: valueDateSchema.optional(),
    description: optionalText(2000),
    /**
     * When true, `manualRate` may replace the Settings market rate.
     * Default false — business rule gate for overrides.
     */
    allowManualRateOverride: z.boolean().optional().default(false),
    manualRate: optionalManualRateSchema.optional(),
  })
  .superRefine((data, context) => {
    if (data.fromCurrencyCode === data.toCurrencyCode) {
      context.addIssue({
        code: "custom",
        path: ["toCurrencyCode"],
        message: "To currency must be different from from currency.",
      });
    }

    if (data.manualRate != null && !data.allowManualRateOverride) {
      context.addIssue({
        code: "custom",
        path: ["manualRate"],
        message:
          "Manual rate override is not enabled for this exchange.",
      });
    }
  });

/** Action/form input shape (preprocess defaults applied on parse). */
export type DepositInput = z.input<typeof depositSchema>;
export type WithdrawalInput = z.input<typeof withdrawalSchema>;
export type ManualAdjustmentInput = z.input<typeof manualAdjustmentSchema>;
export type ExchangeInput = z.input<typeof exchangeSchema>;

export type DepositFieldErrors = Partial<
  Record<keyof z.infer<typeof depositSchema>, string>
>;
export type WithdrawalFieldErrors = Partial<
  Record<keyof z.infer<typeof withdrawalSchema>, string>
>;
export type ManualAdjustmentFieldErrors = Partial<
  Record<keyof z.infer<typeof manualAdjustmentSchema>, string>
>;
export type ExchangeFieldErrors = Partial<
  Record<keyof z.infer<typeof exchangeSchema>, string>
>;

function toFieldErrors<T extends string>(
  error: z.ZodError,
): Partial<Record<T, string>> {
  const fieldErrors: Partial<Record<T, string>> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key as T]) {
      fieldErrors[key as T] = issue.message;
    }
  }

  return fieldErrors;
}

export function toDepositFieldErrors(error: z.ZodError): DepositFieldErrors {
  return toFieldErrors<keyof DepositInput>(error);
}

export function toWithdrawalFieldErrors(
  error: z.ZodError,
): WithdrawalFieldErrors {
  return toFieldErrors<keyof WithdrawalInput>(error);
}

export function toManualAdjustmentFieldErrors(
  error: z.ZodError,
): ManualAdjustmentFieldErrors {
  return toFieldErrors<keyof ManualAdjustmentInput>(error);
}

export function toExchangeFieldErrors(error: z.ZodError): ExchangeFieldErrors {
  return toFieldErrors<keyof ExchangeInput>(error);
}
