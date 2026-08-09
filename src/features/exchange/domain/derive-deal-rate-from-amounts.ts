import {
  EXCHANGE_RATE_MAX_DECIMALS,
  normalizeRateString,
} from "@/features/exchange-rates/domain/rate";
import {
  createCurrency,
  moneyFromMajorUnits,
} from "@/features/ledger/domain";

function pow10(exponent: number): bigint {
  let value = BigInt(1);
  for (let i = 0; i < exponent; i += 1) {
    value *= BigInt(10);
  }
  return value;
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) {
    return BigInt(0);
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) {
    return quotient + BigInt(1);
  }
  return quotient;
}

function rateFromMinors(input: {
  numeratorMinor: bigint;
  numeratorDecimals: number;
  denominatorMinor: bigint;
  denominatorDecimals: number;
}): string | null {
  if (input.numeratorMinor <= BigInt(0) || input.denominatorMinor <= BigInt(0)) {
    return null;
  }

  // majorRatio = (numMinor / 10^numDec) / (denMinor / 10^denDec)
  //            = numMinor * 10^denDec / (denMinor * 10^numDec)
  const numerator =
    input.numeratorMinor *
    pow10(input.denominatorDecimals + EXCHANGE_RATE_MAX_DECIMALS);
  const denominator =
    input.denominatorMinor * pow10(input.numeratorDecimals);
  const scaled = divRoundHalfUp(numerator, denominator);
  if (scaled <= BigInt(0)) {
    return null;
  }

  const whole = scaled / pow10(EXCHANGE_RATE_MAX_DECIMALS);
  const fraction = (scaled % pow10(EXCHANGE_RATE_MAX_DECIMALS))
    .toString()
    .padStart(EXCHANGE_RATE_MAX_DECIMALS, "0");

  try {
    return normalizeRateString(`${whole}.${fraction}`);
  } catch {
    return null;
  }
}

function formatRateForDisplay(rate: string): string {
  const trimmed = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  const [whole, fraction] = trimmed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fraction == null || fraction.length === 0) {
    return grouped;
  }
  const trimmedFraction = fraction.replace(/0+$/, "");
  if (!trimmedFraction) {
    return grouped;
  }
  const capped =
    trimmedFraction.length > 4 ? trimmedFraction.slice(0, 4) : trimmedFraction;
  return `${grouped}.${capped}`;
}

export type DerivedDealRate = {
  /**
   * Service / snapshot rate: receive (to) units per 1 give (from) unit.
   */
  serviceRate: string;
  /**
   * Counter display rate: give units per 1 receive unit
   * (example: 1 USD = 66.67 AFN).
   */
  displayRate: string;
  displayLabel: string;
};

/**
 * Derive the effective deal rate from the two amounts the cashier entered.
 * Does not change either amount.
 */
export function deriveDealRateFromAmounts(input: {
  giveAmountMajor: string;
  giveCurrencyCode: string;
  giveDecimalPlaces: number;
  receiveAmountMajor: string;
  receiveCurrencyCode: string;
  receiveDecimalPlaces: number;
}): DerivedDealRate | null {
  const giveAmount = input.giveAmountMajor.trim();
  const receiveAmount = input.receiveAmountMajor.trim();
  const giveCode = input.giveCurrencyCode.trim().toUpperCase();
  const receiveCode = input.receiveCurrencyCode.trim().toUpperCase();

  if (!giveAmount || !receiveAmount || !giveCode || !receiveCode) {
    return null;
  }
  if (giveCode === receiveCode) {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(giveAmount) || Number(giveAmount) <= 0) {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(receiveAmount) || Number(receiveAmount) <= 0) {
    return null;
  }

  try {
    const giveCurrency = createCurrency({
      code: giveCode,
      name: giveCode,
      decimalPlaces: input.giveDecimalPlaces,
    });
    const receiveCurrency = createCurrency({
      code: receiveCode,
      name: receiveCode,
      decimalPlaces: input.receiveDecimalPlaces,
    });

    const giveMoney = moneyFromMajorUnits(giveAmount, giveCurrency);
    const receiveMoney = moneyFromMajorUnits(receiveAmount, receiveCurrency);

    const serviceRate = rateFromMinors({
      numeratorMinor: receiveMoney.amountMinor,
      numeratorDecimals: input.receiveDecimalPlaces,
      denominatorMinor: giveMoney.amountMinor,
      denominatorDecimals: input.giveDecimalPlaces,
    });
    const displayRate = rateFromMinors({
      numeratorMinor: giveMoney.amountMinor,
      numeratorDecimals: input.giveDecimalPlaces,
      denominatorMinor: receiveMoney.amountMinor,
      denominatorDecimals: input.receiveDecimalPlaces,
    });

    if (!serviceRate || !displayRate) {
      return null;
    }

    return {
      serviceRate,
      displayRate,
      displayLabel: `1 ${receiveCode} = ${formatRateForDisplay(displayRate)} ${giveCode}`,
    };
  } catch {
    return null;
  }
}
