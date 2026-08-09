import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import type { TransactionFormOptions } from "@/features/transactions/domain/types";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export async function getTransactionFormOptions(): Promise<TransactionFormOptions> {
  const [customers, wallets, currencies] = await Promise.all([
    listCustomers(),
    listWallets({ isActive: true }),
    listCurrencies({ isActive: true }),
  ]);

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: formatCustomerLabel(customer.fullName, customer.code),
    })),
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
      type: wallet.type,
      customerId: wallet.customerId,
    })),
    currencies: currencies.map((currency) => ({
      code: currency.code,
      label: formatCurrencyLabel({
        code: currency.code,
        symbol: currency.symbol,
      }),
      symbol: currency.symbol,
    })),
  };
}
