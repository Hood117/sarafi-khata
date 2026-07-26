import { createMoney, type Money } from "@/features/ledger/domain";
import {
  EXCHANGE_RATE_MAX_DECIMALS,
  normalizeRateString,
} from "@/features/exchange-rates/domain/rate";
import { LedgerDomainError } from "@/features/ledger/domain/errors";

/**
 * Deal rate convention for currency exchange:
 * to-currency units per 1 from-currency unit
 * (example: from USD, to AFN, rate 70 → 1 USD = 70 AFN).
 */

function pow10(exponent: number): bigint {
  let value = BigInt(1);
  for (let i = 0; i < exponent; i += 1) {
    value *= BigInt(10);
  }
  return value;
}

function parseRateParts(rate: string): { digits: bigint; scale: number } {
  const normalized = normalizeRateString(rate);
  if (!(Number(normalized) > 0)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "Exchange rate must be greater than zero.",
    );
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  return {
    digits: BigInt(`${wholePart}${fractionPart}` || "0"),
    scale: fractionPart.length,
  };
}

/** Round half up: numerator / denominator → bigint quotient. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "Invalid rate denominator.",
    );
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) {
    return quotient + BigInt(1);
  }
  return quotient;
}

/**
 * Invert a positive rate string (1 / rate), capped at FX max decimals.
 */
export function invertRateString(rate: string): string {
  const { digits, scale } = parseRateParts(rate);
  // 1 / (digits * 10^-scale) = 10^scale / digits
  // Produce EXCHANGE_RATE_MAX_DECIMALS fractional digits with half-up rounding.
  const numerator = pow10(scale + EXCHANGE_RATE_MAX_DECIMALS);
  const invertedMinor = divRoundHalfUp(numerator, digits);
  const whole = invertedMinor / pow10(EXCHANGE_RATE_MAX_DECIMALS);
  const fraction = (invertedMinor % pow10(EXCHANGE_RATE_MAX_DECIMALS))
    .toString()
    .padStart(EXCHANGE_RATE_MAX_DECIMALS, "0");
  return normalizeRateString(`${whole}.${fraction}`);
}

/**
 * Convert a from-currency minor amount to to-currency minor units using
 * deal rate (to units per 1 from unit). Half-up rounding at to-currency scale.
 */
export function convertMinorByRate(input: {
  fromAmountMinor: bigint;
  fromDecimalPlaces: number;
  toDecimalPlaces: number;
  rate: string;
}): bigint {
  const { fromAmountMinor, fromDecimalPlaces, toDecimalPlaces, rate } = input;

  if (fromAmountMinor <= BigInt(0)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "Amount must be greater than zero.",
    );
  }

  const { digits: rateDigits, scale: rateScale } = parseRateParts(rate);

  // toMinor = fromMinor * rate * 10^(toDecimals - fromDecimals)
  //        = fromMinor * rateDigits * 10^toDecimals
  //          / (10^fromDecimals * 10^rateScale)
  const numerator =
    fromAmountMinor * rateDigits * pow10(toDecimalPlaces);
  const denominator = pow10(fromDecimalPlaces) * pow10(rateScale);
  const toMinor = divRoundHalfUp(numerator, denominator);

  if (toMinor <= BigInt(0)) {
    throw new LedgerDomainError(
      "INVALID_MONEY",
      "Converted amount rounds to zero; increase the amount or check the rate.",
    );
  }

  return toMinor;
}

export function convertMoneyByRate(input: {
  fromMoney: Money;
  fromDecimalPlaces: number;
  toCurrencyCode: string;
  toDecimalPlaces: number;
  rate: string;
}): Money {
  const toMinor = convertMinorByRate({
    fromAmountMinor: input.fromMoney.amountMinor,
    fromDecimalPlaces: input.fromDecimalPlaces,
    toDecimalPlaces: input.toDecimalPlaces,
    rate: input.rate,
  });

  return createMoney(toMinor, input.toCurrencyCode);
}
