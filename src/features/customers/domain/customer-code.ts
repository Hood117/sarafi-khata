/** Main Vault is account #1; customers allocate from #2 upward (ADR-045). */
export const CUSTOMER_ACCOUNT_NUMBER_START = 2;

/** @deprecated Use CUSTOMER_ACCOUNT_NUMBER_START — unified account numbers replaced the 1001 system. */
export const CUSTOMER_CODE_START = CUSTOMER_ACCOUNT_NUMBER_START;

/**
 * Parses an account number into a sequence when it is a plain integer string.
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
 * Next account number given existing codes (active and archived).
 * Starts at 2 (Main Vault is #1) and continues past the highest existing numeric code.
 * Prefer the Tauri allocator (`allocate_next_account_number`) on the live desk path.
 */
export function computeNextCustomerCode(existingCodes: Array<string | null>): string {
  let maxSequence = CUSTOMER_ACCOUNT_NUMBER_START - 1;

  for (const code of existingCodes) {
    const sequence = parseCustomerCodeSequence(code);
    if (sequence !== null && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  // Never assign #1 (reserved for Main Vault).
  return String(Math.max(maxSequence + 1, CUSTOMER_ACCOUNT_NUMBER_START));
}
