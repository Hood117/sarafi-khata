import { z } from "zod";

/** Max stored phone string length (Customer.phone). */
export const PHONE_MAX_LENGTH = 50;

/** Digit count after stripping separators. */
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;

/** Allowed phone characters after Western digit conversion: digits, +, space, dash. */
const PHONE_ALLOWED_RE = /^[0-9+\s-]*$/;

export type PhoneValidationError = "required" | "invalid";

export type PhoneValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; error: PhoneValidationError };

/** Strip to ASCII digits only (for uniqueness / digit-count checks). */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Loose phone check: digits, +, spaces, dashes only;
 * digit count 7–15; trimmed length ≤ 50.
 */
export function isValidPhoneFormat(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.length > PHONE_MAX_LENGTH) return false;
  if (!PHONE_ALLOWED_RE.test(trimmed)) return false;
  const digits = phoneDigits(trimmed);
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

/**
 * Validate a phone field.
 * - `required: false` → empty → null
 * - non-empty must pass format rules
 */
export function validatePhone(
  raw: string | null | undefined,
  options: { required?: boolean } = {},
): PhoneValidationResult {
  const required = options.required ?? false;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    if (required) return { ok: false, error: "required" };
    return { ok: true, value: null };
  }
  if (!isValidPhoneFormat(trimmed)) {
    return { ok: false, error: "invalid" };
  }
  return { ok: true, value: trimmed };
}

/** Filter typed input: keep digits / + / space / - only (expects Western digits). */
export function filterPhoneChars(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if ((ch >= "0" && ch <= "9") || ch === "+" || ch === " " || ch === "-") {
      out += ch;
    }
  }
  return out;
}

export const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, { error: "Phone is required." })
  .refine((value) => isValidPhoneFormat(value), {
    error: "Enter a valid phone (digits, spaces, + or -).",
  });

export const optionalPhoneSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z
    .string()
    .max(PHONE_MAX_LENGTH, {
      error: `Phone must be at most ${PHONE_MAX_LENGTH} characters.`,
    })
    .refine((value) => value === "" || isValidPhoneFormat(value), {
      error: "Enter a valid phone (digits, spaces, + or -).",
    })
    .transform((value) => (value === "" ? null : value)),
);
