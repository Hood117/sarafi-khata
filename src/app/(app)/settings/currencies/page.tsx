import { CurrenciesView, getCurrencyList } from "@/features/currencies";

export default async function SettingsCurrenciesPage() {
  const currencies = await getCurrencyList();

  return <CurrenciesView currencies={currencies} />;
}
