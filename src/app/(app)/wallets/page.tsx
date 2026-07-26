import { getCustomerList } from "@/features/customers";
import { getWalletList, WalletsView } from "@/features/wallets";

export default async function WalletsPage() {
  const [wallets, customers] = await Promise.all([
    getWalletList(),
    getCustomerList(),
  ]);

  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    label: customer.fullName,
  }));

  return (
    <WalletsView wallets={wallets} customerOptions={customerOptions} />
  );
}
