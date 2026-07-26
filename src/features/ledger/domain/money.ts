import {
  assertSameCurrencyCode,
  type Currency,
  type CurrencyCode,
  toCurrencyCode,
} from "@/features/ledger/domain/currency";
import { LedgerDomainError } from "@/features/ledger/domain/errors";

/**
 * Money in integer minor units (e.g. cents) to avoid floating-point drift.
 */
export type Money = {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
};

export function createMoney(
  amountMinor: bigint | number | string,
  currency: CurrencyCode | string,
): Money {
  const currencyCode = toCurrencyCode(String(currency));

  let minor: bigint;

  try {
    minor = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  } catch {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "amountMinor must be an integer value.",
    );
  }

  return {
    amountMinor: minor,
    currency: currencyCode,
  };
}

/** Convert a major-unit decimal string (e.g. "12.50") into Money. */
export function moneyFromMajorUnits(
  majorAmount: string,
  currency: Currency,
): Money {
  const normalized = majorAmount.trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      `Invalid major-unit amount: "${majorAmount}".`,
    );
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsigned.split(".");

  if (fractionPart.length > currency.decimalPlaces) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      `Amount has more than ${currency.decimalPlaces} decimal places.`,
    );
  }

  const paddedFraction = fractionPart.padEnd(currency.decimalPlaces, "0");
  const minor = BigInt(`${wholePart}${paddedFraction}` || "0");

  return createMoney(negative ? -minor : minor, currency.code);
}

/**
 * Convert Money minor units to a major-unit decimal string for Prisma Decimal persistence.
 * Ledger amounts must be non-negative; scale is taken from the currency record.
 */
export function moneyToMajorUnitString(
  money: Money,
  decimalPlaces: number,
): string {
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 8
  ) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "decimalPlaces must be an integer between 0 and 8.",
    );
  }

  if (money.amountMinor < BigInt(0)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "Cannot persist a negative ledger amount; use direction for sign.",
    );
  }

  const digits = money.amountMinor
    .toString()
    .padStart(decimalPlaces + 1, "0");

  if (decimalPlaces === 0) {
    return digits;
  }

  const whole = digits.slice(0, -decimalPlaces) || "0";
  const fraction = digits.slice(-decimalPlaces);
  return `${whole}.${fraction}`;
}

export function assertSameCurrency(left: Money, right: Money): void {
  assertSameCurrencyCode(left.currency, right.currency);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.amountMinor + right.amountMinor, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.amountMinor - right.amountMinor, left.currency);
}

export function negateMoney(money: Money): Money {
  return createMoney(-money.amountMinor, money.currency);
}

export function isZeroMoney(money: Money): boolean {
  return money.amountMinor === BigInt(0);
}

export function isPositiveMoney(money: Money): boolean {
  return money.amountMinor > BigInt(0);
}

export function absMoney(money: Money): Money {
  return money.amountMinor < BigInt(0) ? negateMoney(money) : money;
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);

  if (left.amountMinor < right.amountMinor) return -1;
  if (left.amountMinor > right.amountMinor) return 1;
  return 0;
}
