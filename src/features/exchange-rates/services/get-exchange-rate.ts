import "server-only";

import { ExchangeRateError } from "@/features/exchange-rates/domain/errors";
import {
  formatEffectiveDate,
  formatRateDisplay,
} from "@/features/exchange-rates/domain/rate";
import type {
  ExchangeRateFormData,
  ExchangeRateListItem,
} from "@/features/exchange-rates/domain/types";
import { findExchangeRateWithCurrenciesById } from "@/features/exchange-rates/repositories/exchange-rate-repository";

export async function getExchangeRateById(
  id: string,
): Promise<ExchangeRateListItem> {
  const rate = await findExchangeRateWithCurrenciesById(id, {
    includeInactive: true,
  });

  if (!rate) {
    throw new ExchangeRateError("NOT_FOUND", "Exchange rate not found.");
  }

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

export async function getExchangeRateForForm(
  id: string,
): Promise<ExchangeRateFormData> {
  const rate = await getExchangeRateById(id);

  return {
    id: rate.id,
    baseCurrencyId: rate.baseCurrencyId,
    quoteCurrencyId: rate.quoteCurrencyId,
    rate: rate.rateDisplay,
    effectiveDate: rate.effectiveDate,
    isActive: rate.isActive,
  };
}
