import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  ExchangeRatesView,
  getExchangeRateFormOptions,
  getExchangeRateList,
} from "@/features/exchange-rates";

export default async function SettingsExchangeRatesPage() {
  await requirePermission("settings.manage");
  const [rates, formOptions] = await Promise.all([
    getExchangeRateList({ includeInactive: true }),
    getExchangeRateFormOptions(),
  ]);

  return (
    <ExchangeRatesView rates={rates} currencies={formOptions.currencies} />
  );
}
