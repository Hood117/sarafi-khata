import "server-only";

import { listCurrencies } from "@/features/currencies/repositories/currency-repository";
import type { SettingsPageData } from "@/features/settings/domain/types";
import { getAppSettings } from "@/features/settings/services/get-app-settings";

export async function getSettingsPageData(): Promise<SettingsPageData> {
  const [settings, currencies] = await Promise.all([
    getAppSettings(),
    listCurrencies({ isActive: true }),
  ]);

  // Ensure the current base currency remains selectable even if inactive.
  const currencyOptions = currencies.map((currency) => ({
    id: currency.id,
    code: currency.code,
    label: `${currency.code} — ${currency.name}`,
  }));

  if (
    settings.baseCurrencyCode &&
    !currencyOptions.some(
      (option) => option.code === settings.baseCurrencyCode,
    )
  ) {
    const all = await listCurrencies();
    const current = all.find(
      (currency) => currency.code === settings.baseCurrencyCode,
    );
    if (current) {
      currencyOptions.unshift({
        id: current.id,
        code: current.code,
        label: `${current.code} — ${current.name} (inactive)`,
      });
    }
  }

  return {
    settings,
    currencies: currencyOptions,
  };
}
