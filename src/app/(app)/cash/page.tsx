import { CashOverviewView } from "@/features/cash-overview";
import { getBusinessCashBalances } from "@/features/wallets";

export default async function BusinessCashOverviewPage() {
  const balances = await getBusinessCashBalances();

  return <CashOverviewView balances={balances} />;
}
