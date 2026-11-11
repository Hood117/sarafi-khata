import { z } from "zod";

import { positiveAmountSchema } from "@/lib/validation";

function optionalText(maxLength = 2000) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

const currencyCodeSchema = z
  .string()
  .trim()
  .min(1, { error: "Currency is required." })
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3,8}$/.test(value), {
    error: "Currency code is invalid.",
  });

const amountSchema = positiveAmountSchema;

export const addExternalMoneySchema = z.object({
  currencyCode: currencyCodeSchema,
  amount: amountSchema,
  cashWalletId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  notes: optionalText(2000),
});

export const updateExternalMoneySchema = z.object({
  transactionId: z.string().trim().min(1, { error: "Record is required." }),
  notes: optionalText(2000),
});

export const archiveExternalMoneySchema = z.object({
  transactionId: z.string().trim().min(1, { error: "Record is required." }),
});

export type AddExternalMoneyInput = z.infer<typeof addExternalMoneySchema>;
export type UpdateExternalMoneyInput = z.infer<typeof updateExternalMoneySchema>;
export type ArchiveExternalMoneyInput = z.infer<
  typeof archiveExternalMoneySchema
>;

export type AddExternalMoneyFieldErrors = Partial<
  Record<"currencyCode" | "amount" | "cashWalletId" | "notes", string>
>;

export type UpdateExternalMoneyFieldErrors = Partial<
  Record<"notes" | "transactionId", string>
>;

export function toAddExternalMoneyFieldErrors(
  error: z.ZodError,
): AddExternalMoneyFieldErrors {
  const fieldErrors: AddExternalMoneyFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "currencyCode" ||
      key === "amount" ||
      key === "cashWalletId" ||
      key === "notes"
    ) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function toUpdateExternalMoneyFieldErrors(
  error: z.ZodError,
): UpdateExternalMoneyFieldErrors {
  const fieldErrors: UpdateExternalMoneyFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "notes" || key === "transactionId") {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function notesFromExternalMoneyDescription(
  description: string | null | undefined,
): string | null {
  const trimmed = description?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const prefix = "External money:";
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    const notes = trimmed.slice(prefix.length).trim();
    return notes || null;
  }
  if (trimmed === "External money added to shop cash") {
    return null;
  }
  return trimmed;
}

export function descriptionFromExternalMoneyNotes(
  notes: string | null | undefined,
): string {
  const trimmed = notes?.trim() || null;
  return trimmed
    ? `External money: ${trimmed}`
    : "External money added to shop cash";
}

export function displayExternalMoneyReference(reference: string): string {
  const trimmed = reference.trim();
  if (trimmed.startsWith("deleted:")) {
    return trimmed.slice("deleted:".length) || trimmed;
  }
  return trimmed;
}

export function isExternalMoneyTransaction(input: {
  type: string;
  reference: string;
  description?: string | null;
}): boolean {
  if (input.type !== "ADJUSTMENT") {
    return false;
  }
  const reference = displayExternalMoneyReference(input.reference);
  if (reference.startsWith("EXT-MONEY-")) {
    return true;
  }
  const description = input.description?.trim() ?? "";
  return /^external money/i.test(description);
}
