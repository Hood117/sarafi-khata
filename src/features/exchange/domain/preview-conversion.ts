import {
  createCurrency,
  moneyFromMajorUnits,
  moneyToMajorUnitString,
} from "@/features/ledger/domain";
import { convertMoneyByRate } from "@/features/transactions/domain/exchange-rate-math";

/**
 * Client-side preview of converted amount. Display only — posting recalculates
 * through the Currency Exchange service.
 */
export function previewConvertedAmount(input: {
  amountMajor: string;
  fromCurrencyCode: string;
  fromDecimalPlaces: number;
  toCurrencyCode: string;
  toDecimalPlaces: number;
  rate: string;
}): string | null {
  const amount = input.amountMajor.trim();
  const rate = input.rate.trim();

  if (!amount || !rate) {
    return null;
  }

  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return null;
  }

  try {
    const fromCurrency = createCurrency({
      code: input.fromCurrencyCode,
      name: input.fromCurrencyCode,
      decimalPlaces: input.fromDecimalPlaces,
    });
    const fromMoney = moneyFromMajorUnits(amount, fromCurrency);
    const toMoney = convertMoneyByRate({
      fromMoney,
      fromDecimalPlaces: input.fromDecimalPlaces,
      toCurrencyCode: input.toCurrencyCode,
      toDecimalPlaces: input.toDecimalPlaces,
      rate,
    });
    return moneyToMajorUnitString(toMoney, input.toDecimalPlaces);
  } catch {
    return null;
  }
}
