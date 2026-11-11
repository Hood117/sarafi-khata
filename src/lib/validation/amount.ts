import { z } from "zod";

/** Major-unit decimal string, e.g. "100.50". */
const MAJOR_AMOUNT_RE = /^\d+(\.\d+)?$/;

export function isPositiveAmountString(raw: string): boolean {
  const trimmed = raw.trim();
  if (!MAJOR_AMOUNT_RE.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0;
}

export function isNonNegativeAmountString(raw: string): boolean {
  const trimmed = raw.trim();
  if (!MAJOR_AMOUNT_RE.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

/** Required positive major-unit amount (money movements, hawala, etc.). */
export const positiveAmountSchema = z
  .string()
  .trim()
  .min(1, { error: "Amount is required." })
  .refine((value) => MAJOR_AMOUNT_RE.test(value), {
    error: "Amount must be a positive number.",
  })
  .refine((value) => Number(value) > 0, {
    error: "Amount must be greater than zero.",
  });

/** Optional positive amount; empty → null. */
export const optionalPositiveAmountSchema = z.preprocess((value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, positiveAmountSchema.nullable());

/** Non-negative major-unit (rates / zero-allowed contexts). */
export const nonNegativeAmountSchema = z
  .string()
  .trim()
  .min(1, { error: "Amount is required." })
  .refine((value) => MAJOR_AMOUNT_RE.test(value), {
    error: "Amount must be a number.",
  })
  .refine((value) => Number(value) >= 0, {
    error: "Amount must be zero or greater.",
  });
