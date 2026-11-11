import {
  isNonNegativeAmountString,
  isPositiveAmountString,
} from "@/lib/validation/amount";

import {
  normalizeAmountInput,
  parseAmountNumber,
  parsePositiveAmount,
} from "@desktop/lib/western-digits";

export {
  isNonNegativeAmountString,
  isPositiveAmountString,
  normalizeAmountInput,
  parseAmountNumber,
  parsePositiveAmount,
};

export type AmountValidationError = "required" | "invalid";

export type AmountValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: AmountValidationError };

/** Require a positive major-unit amount (normalizes Eastern digits first). */
export function requirePositiveAmount(
  raw: string | null | undefined,
): AmountValidationResult {
  const normalized = normalizeAmountInput(String(raw ?? "").trim());
  if (!normalized || normalized === ".") {
    return { ok: false, error: "required" };
  }
  if (!isPositiveAmountString(normalized)) {
    return { ok: false, error: "invalid" };
  }
  return { ok: true, value: normalized };
}

/** Optional positive amount; empty → ok with empty value. */
export function optionalPositiveAmount(
  raw: string | null | undefined,
): AmountValidationResult | { ok: true; value: null } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  return requirePositiveAmount(trimmed);
}
