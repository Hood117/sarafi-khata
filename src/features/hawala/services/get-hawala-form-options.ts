import "server-only";

import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import type { HawalaFormOptions } from "@/features/hawala/domain/types";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export async function getHawalaFormOptions(): Promise<HawalaFormOptions> {
  const [customers, wallets, currencies] = await Promise.all([
    listCustomers(),
    listWallets({ isActive: true }),
    listCurrencies({ isActive: true }),
  ]);

  const cashWallets = wallets
    .filter((wallet) => wallet.type === "VAULT" || wallet.type === "TILL")
    .map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
    }));

  const clearingWallets = wallets
    .filter((wallet) => wallet.type === "SYSTEM")
    .map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
    }));

  // Prefer Hawala Clearing as the first option when present.
  clearingWallets.sort((left, right) => {
    const leftScore = left.label === "Hawala Clearing" ? 0 : 1;
    const rightScore = right.label === "Hawala Clearing" ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return left.label.localeCompare(right.label);
  });

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: customer.fullName,
    })),
    cashWallets,
    clearingWallets,
    currencies: currencies.map((currency) => ({
      code: currency.code,
      label: currency.symbol
        ? `${currency.code} (${currency.symbol})`
        : currency.code,
    })),
  };
}
