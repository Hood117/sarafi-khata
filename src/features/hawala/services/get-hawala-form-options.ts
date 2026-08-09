import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import type { HawalaFormOptions } from "@/features/hawala/domain/types";
import { listActivePartnerSarafiOptions } from "@/features/partner-sarafi";
import { getBaseCurrencyCode } from "@/features/settings";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import {
  CASH_TILL_WALLET_NAME,
  HAWALA_CLEARING_WALLET_NAME,
  MAIN_VAULT_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

function preferWalletNameScore(label: string, preferred: string[]): number {
  const index = preferred.indexOf(label);
  return index === -1 ? preferred.length : index;
}

export async function getHawalaFormOptions(): Promise<HawalaFormOptions> {
  const [customers, wallets, currencies, partners, baseCurrencyCode] =
    await Promise.all([
      listCustomers(),
      listWallets({ isActive: true }),
      listCurrencies({ isActive: true }),
      listActivePartnerSarafiOptions(),
      getBaseCurrencyCode(),
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

  cashWallets.sort((left, right) => {
    const leftScore = preferWalletNameScore(left.label, [
      CASH_TILL_WALLET_NAME,
      MAIN_VAULT_WALLET_NAME,
    ]);
    const rightScore = preferWalletNameScore(right.label, [
      CASH_TILL_WALLET_NAME,
      MAIN_VAULT_WALLET_NAME,
    ]);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return left.label.localeCompare(right.label);
  });

  clearingWallets.sort((left, right) => {
    const leftScore = preferWalletNameScore(left.label, [
      HAWALA_CLEARING_WALLET_NAME,
    ]);
    const rightScore = preferWalletNameScore(right.label, [
      HAWALA_CLEARING_WALLET_NAME,
    ]);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return left.label.localeCompare(right.label);
  });

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: formatCustomerLabel(customer.fullName, customer.code),
      fullName: customer.fullName,
      phone: customer.phone,
    })),
    partners: partners.map((partner) => ({
      id: partner.id,
      name: partner.name,
      label: partner.label,
      commissionEnabled: partner.commissionEnabled,
      commissionPerAmount: partner.commissionPerAmount,
      commissionFeeAmount: partner.commissionFeeAmount,
      commissionCurrencyCode: partner.commissionCurrencyCode,
      commissionDecimalPlaces: partner.commissionDecimalPlaces,
    })),
    cashWallets,
    clearingWallets,
    currencies: currencies
      .map((currency) => ({
        code: currency.code,
        label: formatCurrencyLabel({
          code: currency.code,
          symbol: currency.symbol,
        }),
      }))
      .sort((left, right) => {
        if (left.code === baseCurrencyCode) {
          return -1;
        }
        if (right.code === baseCurrencyCode) {
          return 1;
        }
        return left.code.localeCompare(right.code);
      }),
  };
}
