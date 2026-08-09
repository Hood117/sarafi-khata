import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import type { TransferFormOptions } from "@/features/transfers/domain/types";

/**
 * Options for the Customer Transfer desk form.
 * Does not load wallets — `transferFunds` resolves customer wallets.
 */
export async function getTransferFormOptions(): Promise<TransferFormOptions> {
  const [customers, currencies] = await Promise.all([
    listCustomers(),
    listCurrencies({ isActive: true }),
  ]);

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: formatCustomerLabel(customer.fullName, customer.code),
    })),
    currencies: currencies.map((currency) => ({
      code: currency.code,
      label: formatCurrencyLabel({
        code: currency.code,
        symbol: currency.symbol,
      }),
    })),
  };
}
