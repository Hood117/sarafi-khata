import { LedgerDomainError } from "@/features/ledger/domain/errors";

/**
 * ISO-like currency code (e.g. AFN, USD). Branded to avoid raw string mix-ups.
 */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

export type Currency = {
  code: CurrencyCode;
  name: string;
  symbol?: string;
  /** Number of decimal digits in the minor unit (e.g. 2 for USD). */
  decimalPlaces: number;
};

const CURRENCY_CODE_PATTERN = /^[A-Z]{3,8}$/;

export function toCurrencyCode(code: string): CurrencyCode {
  const normalized = code.trim().toUpperCase();

  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    throw new LedgerDomainError(
      "INVALID_CURRENCY",
      `Invalid currency code: "${code}".`,
    );
  }

  return normalized as CurrencyCode;
}

export function createCurrency(input: {
  code: string;
  name: string;
  symbol?: string;
  decimalPlaces?: number;
}): Currency {
  const code = toCurrencyCode(input.code);
  const decimalPlaces = input.decimalPlaces ?? 2;

  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 8) {
    throw new LedgerDomainError(
      "INVALID_CURRENCY",
      "decimalPlaces must be an integer between 0 and 8.",
    );
  }

  const name = input.name.trim();

  if (!name) {
    throw new LedgerDomainError("INVALID_CURRENCY", "Currency name is required.");
  }

  return {
    code,
    name,
    symbol: input.symbol?.trim() || undefined,
    decimalPlaces,
  };
}

export function assertSameCurrencyCode(
  left: CurrencyCode,
  right: CurrencyCode,
  message = "Currency mismatch.",
): void {
  if (left !== right) {
    throw new LedgerDomainError("CURRENCY_MISMATCH", message);
  }
}
