import "server-only";

import type { BusinessCashBalance } from "@/features/wallets/domain/types";
import { deriveCurrencyBalancesForWallets } from "@/features/wallets/services/derive-currency-balances";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

/**
 * Company available cash by currency from VAULT and TILL wallets.
 * Derived from the ledger via createBalanceCalculator — not stored.
 */
export async function getBusinessCashBalances(): Promise<BusinessCashBalance[]> {
  const wallets = await listWallets({ isActive: true });
  const cashWalletIds = wallets
    .filter((wallet) => wallet.type === "VAULT" || wallet.type === "TILL")
    .map((wallet) => wallet.id);

  return deriveCurrencyBalancesForWallets(cashWalletIds);
}
