import "server-only";

import { listCurrencies } from "@/features/currencies/repositories/currency-repository";
import type { ExchangeRateFormOptions } from "@/features/exchange-rates/domain/types";

export async function getExchangeRateFormOptions(): Promise<ExchangeRateFormOptions> {
  // Include inactive (non-deleted) currencies so existing rates remain editable.
  // Create still rejects inactive currencies in the service layer.
  const currencies = await listCurrencies();

  return {
    currencies: currencies.map((currency) => ({
      id: currency.id,
      code: currency.code,
      label: currency.isActive
        ? `${currency.code} — ${currency.name}`
        : `${currency.code} — ${currency.name} (inactive)`,
    })),
  };
}
