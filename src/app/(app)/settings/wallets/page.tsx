import { formatCustomerLabel, getCustomerList } from "@/features/customers";
import { getWalletList, WalletsView } from "@/features/wallets";

export default async function SettingsWalletsPage() {
  const [wallets, customers] = await Promise.all([
    getWalletList(),
    getCustomerList(),
  ]);

  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    label: formatCustomerLabel(customer.fullName, customer.code),
  }));

  return (
    <WalletsView wallets={wallets} customerOptions={customerOptions} />
  );
}
