/** First auto-assigned customer code. */
export const CUSTOMER_CODE_START = 1001;

/**
 * Parses a customer code into a sequence number when it is a plain integer string.
 * Non-numeric / empty codes are ignored for sequence allocation.
 */
export function parseCustomerCodeSequence(
  code: string | null | undefined,
): number | null {
  const trimmed = code?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return value;
}

/**
 * Next code string given existing customer codes (active and archived).
 * Starts at 1001 and continues past the highest existing numeric code.
 */
export function computeNextCustomerCode(existingCodes: Array<string | null>): string {
  let maxSequence = CUSTOMER_CODE_START - 1;

  for (const code of existingCodes) {
    const sequence = parseCustomerCodeSequence(code);
    if (sequence !== null && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return String(maxSequence + 1);
}
