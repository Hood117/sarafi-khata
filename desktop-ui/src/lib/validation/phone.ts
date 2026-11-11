import {
  filterPhoneChars,
  isValidPhoneFormat,
  phoneDigits,
  validatePhone,
  type PhoneValidationError,
  type PhoneValidationResult,
  PHONE_MAX_DIGITS,
  PHONE_MAX_LENGTH,
  PHONE_MIN_DIGITS,
} from "@/lib/validation/phone";

import { toWesternDigits } from "@desktop/lib/western-digits";

export {
  filterPhoneChars,
  isValidPhoneFormat,
  phoneDigits,
  validatePhone,
  PHONE_MAX_DIGITS,
  PHONE_MAX_LENGTH,
  PHONE_MIN_DIGITS,
  type PhoneValidationError,
  type PhoneValidationResult,
};

/**
 * Normalize phone typing: Westernize digits, drop illegal characters.
 * Does not trim spaces mid-edit (trim on submit via validatePhone).
 */
export function normalizePhoneInput(raw: string): string {
  return filterPhoneChars(toWesternDigits(raw));
}
