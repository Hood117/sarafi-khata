import {
  formatRateDisplay,
  isPositiveRateString,
} from "@/features/exchange-rates/domain/rate";
import { invertRateString } from "@/features/transactions/domain/exchange-rate-math";
import type { ExchangeRateOption } from "@/features/exchange/domain/types";

/**
 * Resolve deal rate (to units per 1 from unit) from preloaded active rates.
 * Prefers direct base=from/quote=to; otherwise inverts the reverse pair.
 */
export function resolveFormDealRate(
  rates: ExchangeRateOption[],
  fromCurrencyCode: string,
  toCurrencyCode: string,
): { rate: string; rateId: string } | null {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();

  if (!from || !to || from === to) {
    return null;
  }

  const direct = rates.find(
    (rate) =>
      rate.baseCurrencyCode === from && rate.quoteCurrencyCode === to,
  );
  if (direct && isPositiveRateString(direct.rate)) {
    return {
      rate: formatRateDisplay({ toString: () => direct.rate }),
      rateId: direct.id,
    };
  }

  const inverse = rates.find(
    (rate) =>
      rate.baseCurrencyCode === to && rate.quoteCurrencyCode === from,
  );
  if (inverse && isPositiveRateString(inverse.rate)) {
    return {
      rate: invertRateString(inverse.rate),
      rateId: inverse.id,
    };
  }

  return null;
}
