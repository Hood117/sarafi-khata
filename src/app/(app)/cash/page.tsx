import { CashOverviewView } from "@/features/cash-overview";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { getBusinessCashBalances } from "@/features/wallets";

export default async function BusinessCashOverviewPage() {
  await requirePermission("dashboard.view");
  const balances = await getBusinessCashBalances();

  return <CashOverviewView balances={balances} />;
}
