import { z } from "zod";

import { positiveAmountSchema } from "@/lib/validation";

const customerIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Customer is required." });

const currencyCodeSchema = z
  .string()
  .trim()
  .min(1, { error: "Currency is required." })
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3,8}$/.test(value), {
    error: "Currency code is invalid.",
  });

const amountSchema = positiveAmountSchema;

const referenceSchema = z
  .string()
  .trim()
  .min(1, { error: "Reference is required." })
  .max(100, { error: "Reference must be at most 100 characters." });

function optionalNotes() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(2000, { error: "Must be at most 2000 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

/**
 * Client form schema for customer transfer.
 * Wallet IDs are resolved inside `transferFunds` — not collected here.
 */
export const transferFormSchema = z
  .object({
    senderCustomerId: customerIdSchema,
    receiverCustomerId: customerIdSchema,
    currencyCode: currencyCodeSchema,
    amount: amountSchema,
    reference: referenceSchema,
    notes: optionalNotes(),
  })
  .superRefine((data, context) => {
    if (data.senderCustomerId === data.receiverCustomerId) {
      context.addIssue({
        code: "custom",
        path: ["receiverCustomerId"],
        message: "Receiver must be different from the sender.",
      });
    }
  });

export type TransferFormSchemaInput = z.input<typeof transferFormSchema>;
export type TransferFormSchemaOutput = z.output<typeof transferFormSchema>;

export type TransferFormFieldErrors = Partial<
  Record<
    | "senderCustomerId"
    | "receiverCustomerId"
    | "currencyCode"
    | "amount"
    | "reference"
    | "notes",
    string
  >
>;

export function toTransferFormFieldErrors(
  error: z.ZodError,
): TransferFormFieldErrors {
  const fieldErrors: TransferFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "senderCustomerId" ||
        key === "receiverCustomerId" ||
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
