/**
 * Exchange rate helpers.
 * Convention: rate means quote units per 1 base unit (1 USD = 70 AFN → rate 70).
 */

const RATE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Max fractional digits stored for FX rates (SQLite Decimal scale enforced here). */
export const EXCHANGE_RATE_MAX_DECIMALS = 8;

export function normalizeRateString(value: string): string {
  const trimmed = value.trim();
  if (!RATE_PATTERN.test(trimmed)) {
    throw new Error("Invalid rate format.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > EXCHANGE_RATE_MAX_DECIMALS) {
    throw new Error(
      `Rate must have at most ${EXCHANGE_RATE_MAX_DECIMALS} decimal places.`,
    );
  }

  const normalizedFraction = fractionPart.replace(/0+$/, "");
  if (!normalizedFraction) {
    return wholePart === "" ? "0" : wholePart;
  }

  return `${wholePart}.${normalizedFraction}`;
}

export function isPositiveRateString(value: string): boolean {
  try {
    const normalized = normalizeRateString(value);
    return Number(normalized) > 0;
  } catch {
    return false;
  }
}

export function formatRateDisplay(rate: { toString(): string }): string {
  return normalizeRateString(rate.toString());
}

/** Parse `YYYY-MM-DD` to a UTC midnight Date for `effectiveAt`. */
export function parseEffectiveDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid effective date.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid effective date.");
  }

  return date;
}

export function formatEffectiveDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
