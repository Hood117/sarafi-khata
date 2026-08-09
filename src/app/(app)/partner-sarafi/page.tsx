import { getCurrencyList } from "@/features/currencies";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { PartnerSarafiView } from "@/features/partner-sarafi/components/partner-sarafi-view";
import { getPartnerSarafiList } from "@/features/partner-sarafi/services/list-partner-sarafi";

export default async function PartnerSarafiPage() {
  await requirePermission("hawala.manage");
  const [partners, currencies] = await Promise.all([
    getPartnerSarafiList(),
    getCurrencyList({ isActive: true }),
  ]);

  return (
    <PartnerSarafiView
      partners={partners}
      currencyOptions={currencies.map((currency) => ({
        code: currency.code,
        label: `${currency.code} — ${currency.name}`,
      }))}
    />
  );
}
