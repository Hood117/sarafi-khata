import { z } from "zod";

/**
 * Shared UI form schema for deposit, withdrawal, and manual adjustment.
 * Server actions re-validate with deposit/withdrawal/adjustment schemas —
 * this schema only shapes collected form data.
 */

export const transactionFormTypeSchema = z.enum(
  ["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"],
  { error: "Transaction type is required." },
);

function optionalNotes() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(2000, { error: "Notes must be at most 2000 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

export const transactionFormSchema = z
  .object({
    type: transactionFormTypeSchema,
    customerId: z.preprocess(
      (value) => {
        if (typeof value !== "string") {
          return "";
        }
        return value.trim();
      },
      z.string(),
    ),
    walletId: z
      .string()
      .trim()
      .min(1, { error: "Wallet is required." }),
    /** Cash wallet (deposit/withdrawal) or credit wallet (adjustment). */
    offsetWalletId: z
      .string()
      .trim()
      .min(1, { error: "Offset wallet is required." }),
    currencyCode: z
      .string()
      .trim()
      .min(1, { error: "Currency is required." })
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3,8}$/.test(value), {
        error: "Currency code is invalid.",
      }),
    amount: z
      .string()
      .trim()
      .min(1, { error: "Amount is required." })
      .refine((value) => /^\d+(\.\d+)?$/.test(value), {
        error: "Amount must be a positive number.",
      })
      .refine((value) => Number(value) > 0, {
        error: "Amount must be greater than zero.",
      }),
    reference: z
      .string()
      .trim()
      .min(1, { error: "Reference is required." })
      .max(100, { error: "Reference must be at most 100 characters." }),
    notes: optionalNotes(),
  })
  .superRefine((data, context) => {
    if (data.type !== "ADJUSTMENT" && !data.customerId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Customer is required.",
      });
    }

    if (data.walletId && data.offsetWalletId === data.walletId) {
      context.addIssue({
        code: "custom",
        path: ["offsetWalletId"],
        message: "Must be different from the selected wallet.",
      });
    }
  });

export type TransactionFormSchemaInput = z.input<typeof transactionFormSchema>;
export type TransactionFormSchemaOutput = z.output<typeof transactionFormSchema>;

export type TransactionFormFieldErrors = Partial<
  Record<
    | "type"
    | "customerId"
    | "walletId"
    | "offsetWalletId"
    | "currencyCode"
    | "amount"
    | "reference"
    | "notes",
    string
  >
>;

export function toTransactionFormFieldErrors(
  error: z.ZodError,
): TransactionFormFieldErrors {
  const fieldErrors: TransactionFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "type" ||
        key === "customerId" ||
        key === "walletId" ||
        key === "offsetWalletId" ||
        key === "currencyCode" ||
        key === "amount" ||
        key === "reference" ||
        key === "notes") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
