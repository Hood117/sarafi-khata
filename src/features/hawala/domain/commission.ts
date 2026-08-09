/**
 * Fixed hawala commission amounts (desk practice).
 *
 * SEND: partner commission accrues payable; own commission posts to cash.
 * RECEIVE: own commission only, posts to cash of the hawala currency.
 */

export type FixedCommissionSnapshot = {
  partnerAmount: string | null;
  ownAmount: string | null;
};

function toPositiveMajor(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return trimmed;
}

/**
 * Normalize optional fixed commission inputs from the form/action layer.
 * Empty / invalid → null (no commission). Positive major-unit string otherwise.
 */
export function resolveFixedHawalaCommissions(input: {
  direction: "SEND" | "RECEIVE";
  partnerCommissionAmount?: string | null;
  ownCommissionAmount?: string | null;
}): FixedCommissionSnapshot {
  const ownAmount = toPositiveMajor(input.ownCommissionAmount);
  const partnerAmount =
    input.direction === "SEND"
      ? toPositiveMajor(input.partnerCommissionAmount)
      : null;

  return { partnerAmount, ownAmount };
}

export function commissionsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = toPositiveMajor(left ?? null);
  const b = toPositiveMajor(right ?? null);
  if (a == null && b == null) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  return Number(a) === Number(b);
}
