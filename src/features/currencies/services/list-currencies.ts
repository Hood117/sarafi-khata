import "server-only";

import type { CurrencyListItem } from "@/features/currencies/domain/types";
import { listCurrencies } from "@/features/currencies/repositories/currency-repository";

export type GetCurrencyListOptions = {
  isActive?: boolean;
};

function toCurrencyListItem(
  currency: Awaited<ReturnType<typeof listCurrencies>>[number],
): CurrencyListItem {
  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    isActive: currency.isActive,
    createdAt: currency.createdAt.toISOString(),
    updatedAt: currency.updatedAt.toISOString(),
  };
}

export async function getCurrencyList(
  options: GetCurrencyListOptions = {},
): Promise<CurrencyListItem[]> {
  const currencies = await listCurrencies({
    isActive: options.isActive,
  });

  return currencies.map(toCurrencyListItem);
}
