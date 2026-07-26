import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { EXCHANGE_BUSINESS_RULES } from "@/features/exchange/domain/business-rules";
import type { ExchangeFormOptions } from "@/features/exchange/domain/types";
import { formatRateDisplay } from "@/features/exchange-rates/domain/rate";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listExchangeRates } from "@/features/ledger/repositories/exchange-rate-repository";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

/**
 * Options for the Currency Exchange desk form.
 * Loads today's active rates (effectiveAt <= now) for client-side pair lookup.
 * Does not compute wallet balances.
 */
export async function getExchangeFormOptions(): Promise<ExchangeFormOptions> {
  const asOf = new Date();

  const [customers, wallets, currencies, rates] = await Promise.all([
    listCustomers(),
    listWallets({ isActive: true }),
    listCurrencies({ isActive: true }),
    listExchangeRates({ asOf }),
  ]);

  const currencyById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );

  // Prefer rates that still have active currencies; skip orphaned pairs.
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

  // Keep only the latest row per base/quote (list is already effectiveAt desc).
  const latestByPair = new Map<string, (typeof rateOptions)[number]>();
  for (const rate of rateOptions) {
    const key = `${rate.baseCurrencyCode}:${rate.quoteCurrencyCode}`;
    if (!latestByPair.has(key)) {
      latestByPair.set(key, rate);
    }
  }

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
      label: currency.symbol
        ? `${currency.code} (${currency.symbol})`
        : currency.code,
      decimalPlaces: currency.decimalPlaces,
    })),
    rates: [...latestByPair.values()],
    allowManualRateOverride: EXCHANGE_BUSINESS_RULES.allowManualRateOverride,
  };
}
