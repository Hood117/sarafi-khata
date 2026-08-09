import { requirePermission } from "@/features/auth/permissions/authorize";
import { CurrenciesView, getCurrencyList } from "@/features/currencies";

export default async function SettingsCurrenciesPage() {
  await requirePermission("settings.manage");
  const currencies = await getCurrencyList();

  return <CurrenciesView currencies={currencies} />;
}
