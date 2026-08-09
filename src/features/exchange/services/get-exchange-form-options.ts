import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { EXCHANGE_BUSINESS_RULES } from "@/features/exchange/domain/business-rules";
import type { ExchangeFormOptions } from "@/features/exchange/domain/types";
import { formatRateDisplay } from "@/features/exchange-rates/domain/rate";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLatestExchangeRatesAsOf } from "@/features/ledger/repositories/exchange-rate-repository";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

/**
 * Options for the Currency Exchange desk form.
 * Loads only the latest rate per pair (not full rate history).
 * Does not compute wallet balances.
 */
export async function getExchangeFormOptions(): Promise<ExchangeFormOptions> {
  const asOf = new Date();

  const [customers, wallets, currencies, rates] = await Promise.all([
    listCustomers(),
    listWallets({ isActive: true }),
    listCurrencies({ isActive: true }),
    listLatestExchangeRatesAsOf(asOf),
  ]);

  const currencyById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );

  const rateOptions = rates
    .map((rate) => {
      const base = currencyById.get(rate.baseCurrencyId);
      const quote = currencyById.get(rate.quoteCurrencyId);
      if (!base || !quote || !base.isActive || !quote.isActive) {
        return null;
      }

      return {
        id: rate.id,
        baseCurrencyCode: base.code,
        quoteCurrencyCode: quote.code,
        rate: formatRateDisplay(rate.rate),
        effectiveAt: rate.effectiveAt.toISOString(),
      };
    })
    .filter((rate): rate is NonNullable<typeof rate> => rate != null);

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: formatCustomerLabel(customer.fullName, customer.code),
    })),
    wallets: wallets
      .filter(
        (wallet) =>
          (wallet.type === "CUSTOMER" ||
            wallet.type === "VAULT" ||
            wallet.type === "TILL") &&
          wallet.name !== EXCHANGE_DIFFERENCE_WALLET_NAME,
      )
      .map((wallet) => ({
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
      decimalPlaces: currency.decimalPlaces,
    })),
    rates: rateOptions,
    allowManualRateOverride: EXCHANGE_BUSINESS_RULES.allowManualRateOverride,
  };
}
