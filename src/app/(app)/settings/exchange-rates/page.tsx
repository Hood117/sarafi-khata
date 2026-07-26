import {
  ExchangeRatesView,
  getExchangeRateFormOptions,
  getExchangeRateList,
} from "@/features/exchange-rates";

export default async function SettingsExchangeRatesPage() {
  const [rates, formOptions] = await Promise.all([
    getExchangeRateList({ includeInactive: true }),
    getExchangeRateFormOptions(),
  ]);

  return (
    <ExchangeRatesView rates={rates} currencies={formOptions.currencies} />
  );
}
