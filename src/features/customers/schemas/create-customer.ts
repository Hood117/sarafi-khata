import { z } from "zod";

function optionalText(maxLength = 500) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

function optionalFatherName() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(200, { error: "Father name must be at most 200 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

function optionalOpeningAmount() {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }, z
    .string()
    .regex(/^\d+(\.\d+)?$/, { error: "Amount must be a positive number." })
    .refine((value) => Number(value) > 0, {
      error: "Amount must be greater than zero.",
    })
    .nullable());
}

function optionalOpeningCurrency() {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim().toUpperCase();
    return trimmed === "" ? null : trimmed;
  }, z
    .string()
    .regex(/^[A-Z]{3,8}$/, { error: "Currency code is invalid." })
    .nullable());
}

const customerProfileFields = {
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Name is required." })
    .max(200, { error: "Name must be at most 200 characters." }),
  fatherName: optionalFatherName(),
  phone: z
    .string()
    .trim()
    .min(1, { error: "Phone is required." })
    .max(50, { error: "Phone must be at most 50 characters." }),
  address: optionalText(500),
  nationalId: optionalText(100),
  notes: optionalText(2000),
};

export const createCustomerSchema = z
  .object({
    ...customerProfileFields,
    openingBalanceAmount: optionalOpeningAmount(),
    openingBalanceCurrencyCode: optionalOpeningCurrency(),
  })
  .superRefine((data, ctx) => {
    const hasAmount = data.openingBalanceAmount != null;
    const hasCurrency = data.openingBalanceCurrencyCode != null;
    if (hasAmount && !hasCurrency) {
      ctx.addIssue({
        code: "custom",
        path: ["openingBalanceCurrencyCode"],
        message: "Currency is required when opening balance is set.",
      });
    }
    if (hasCurrency && !hasAmount) {
      ctx.addIssue({
        code: "custom",
        path: ["openingBalanceAmount"],
        message: "Amount is required when opening currency is set.",
      });
    }
  });

export const updateCustomerSchema = z.object(customerProfileFields);

export type CreateCustomerInput = z.output<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.output<typeof updateCustomerSchema>;

export type CreateCustomerFieldErrors = Partial<
  Record<
    | "fullName"
    | "fatherName"
    | "phone"
    | "address"
    | "nationalId"
    | "notes"
    | "openingBalanceAmount"
    | "openingBalanceCurrencyCode",
    string
  >
>;

export type UpdateCustomerFieldErrors = Partial<
  Record<
    "fullName" | "fatherName" | "phone" | "address" | "nationalId" | "notes",
    string
  >
>;

function collectFieldErrors<T extends string>(
  error: z.ZodError,
  allowed: readonly T[],
): Partial<Record<T, string>> {
  const fieldErrors: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (allowed as readonly string[]).includes(key) &&
      !fieldErrors[key as T]
    ) {
      fieldErrors[key as T] = issue.message;
    }
  }
  return fieldErrors;
}

export function toCreateCustomerFieldErrors(
  error: z.ZodError,
): CreateCustomerFieldErrors {
  return collectFieldErrors(error, [
    "fullName",
    "fatherName",
    "phone",
    "address",
    "nationalId",
    "notes",
    "openingBalanceAmount",
    "openingBalanceCurrencyCode",
  ] as const);
}

export function toUpdateCustomerFieldErrors(
  error: z.ZodError,
): UpdateCustomerFieldErrors {
  return collectFieldErrors(error, [
    "fullName",
    "fatherName",
    "phone",
    "address",
    "nationalId",
    "notes",
  ] as const);
}
