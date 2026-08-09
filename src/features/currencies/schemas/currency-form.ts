import { z } from "zod";

const currencyCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(3, { error: "Currency code must be 3–8 letters." })
      .max(8, { error: "Currency code must be 3–8 letters." })
      .regex(/^[A-Z]{3,8}$/, {
        error: "Currency code must be 3–8 letters (A–Z).",
      }),
  );

function optionalSymbol() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(16, { error: "Symbol must be at most 16 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

export const createCurrencySchema = z.object({
  code: currencyCodeSchema,
  name: z
    .string()
    .trim()
    .min(1, { error: "Currency name is required." })
    .max(100, { error: "Currency name must be at most 100 characters." }),
  symbol: optionalSymbol(),
  isActive: z.boolean(),
});

export const updateCurrencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Currency name is required." })
    .max(100, { error: "Currency name must be at most 100 characters." }),
  symbol: optionalSymbol(),
  isActive: z.boolean(),
});

export type CreateCurrencySchemaInput = z.input<typeof createCurrencySchema>;
export type CreateCurrencySchemaOutput = z.output<typeof createCurrencySchema>;
export type UpdateCurrencySchemaOutput = z.output<typeof updateCurrencySchema>;

export type CurrencyFormFieldErrors = Partial<
  Record<"code" | "name" | "symbol" | "isActive", string>
>;

export function toCurrencyFormFieldErrors(
  error: z.ZodError,
): CurrencyFormFieldErrors {
  const fieldErrors: CurrencyFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "code" ||
        key === "name" ||
        key === "symbol" ||
        key === "isActive") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
