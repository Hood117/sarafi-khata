import { getCurrencyList } from "@/features/currencies";
import { getCustomerList } from "@/features/customers";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { PartnerSarafiView } from "@/features/partner-sarafi/components/partner-sarafi-view";
import { getPartnerSarafiList } from "@/features/partner-sarafi/services/list-partner-sarafi";

export default async function PartnerSarafiPage() {
  await requirePermission("hawala.manage");
  const [partners, currencies, customers] = await Promise.all([
    getPartnerSarafiList(),
    getCurrencyList({ isActive: true }),
    getCustomerList({ archiveFilter: "active" }),
  ]);

  return (
    <PartnerSarafiView
      partners={partners}
      customerOptions={customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        label: customer.code
          ? `${customer.code} · ${customer.fullName}`
          : customer.fullName,
        phone: customer.phone,
      }))}
      currencyOptions={currencies.map((currency) => ({
        code: currency.code,
        label: `${currency.code} — ${currency.name}`,
      }))}
    />
  );
}
