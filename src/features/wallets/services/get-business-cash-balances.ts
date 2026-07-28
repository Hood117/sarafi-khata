import "server-only";

import type { BusinessCashBalance } from "@/features/wallets/domain/types";
import { deriveCurrencyBalancesForWallets } from "@/features/wallets/services/derive-currency-balances";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

/**
 * Company available cash by currency from VAULT and TILL wallets.
 * Derived from the ledger via createBalanceCalculator — not stored.
 */
export async function getBusinessCashBalances(): Promise<BusinessCashBalance[]> {
  const [vaultWallets, tillWallets] = await Promise.all([
    listWallets({ isActive: true, type: "VAULT" }),
    listWallets({ isActive: true, type: "TILL" }),
  ]);
  const cashWalletIds = [...vaultWallets, ...tillWallets].map(
    (wallet) => wallet.id,
  );

  return deriveCurrencyBalancesForWallets(cashWalletIds);
}
