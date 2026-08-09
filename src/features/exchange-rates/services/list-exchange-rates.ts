import "server-only";

import {
  formatEffectiveDate,
  formatRateDisplay,
} from "@/features/exchange-rates/domain/rate";
import type { ExchangeRateListItem } from "@/features/exchange-rates/domain/types";
import {
  listExchangeRatesWithCurrencies,
  type ExchangeRateWithCurrencies,
} from "@/features/exchange-rates/repositories/exchange-rate-repository";

export type GetExchangeRateListOptions = {
  /** Default true — include inactive (soft-deleted) rates for settings. */
  includeInactive?: boolean;
  baseCurrencyId?: string;
  quoteCurrencyId?: string;
};

function toListItem(rate: ExchangeRateWithCurrencies): ExchangeRateListItem {
  return {
    id: rate.id,
    baseCurrencyId: rate.baseCurrencyId,
    baseCurrencyCode: rate.baseCurrency.code,
    quoteCurrencyId: rate.quoteCurrencyId,
    quoteCurrencyCode: rate.quoteCurrency.code,
    rateDisplay: formatRateDisplay(rate.rate),
    effectiveDate: formatEffectiveDate(rate.effectiveAt),
    effectiveAt: rate.effectiveAt.toISOString(),
    isActive: rate.deletedAt === null,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}

export async function getExchangeRateList(
  options: GetExchangeRateListOptions = {},
): Promise<ExchangeRateListItem[]> {
  const rates = await listExchangeRatesWithCurrencies({
    includeInactive: options.includeInactive ?? true,
    baseCurrencyId: options.baseCurrencyId,
    quoteCurrencyId: options.quoteCurrencyId,
  });

  return rates.map(toListItem);
}
