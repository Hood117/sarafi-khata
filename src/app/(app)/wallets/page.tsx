import { formatCustomerLabel, getCustomerList } from "@/features/customers";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { getWalletList, WalletsView } from "@/features/wallets";

export default async function WalletsPage() {
  await requirePermission("wallets.manage");

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
