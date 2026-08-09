"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import {
  CASH_TILL_WALLET_NAME,
  MAIN_VAULT_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export type ExternalMoneyCurrencyOption = {
  code: string;
  label: string;
  symbol: string | null;
};

export type ExternalMoneyCashWalletOption = {
  id: string;
  label: string;
  type: "TILL" | "VAULT";
};

export type ExternalMoneyPageData = {
  currencies: ExternalMoneyCurrencyOption[];
  cashWallets: ExternalMoneyCashWalletOption[];
  defaultCashWalletId: string;
};

export async function getExternalMoneyPageData(): Promise<ExternalMoneyPageData> {
  await requirePermission("transactions.manage");

  const [currencies, tillWallets, vaultWallets] = await Promise.all([
    listCurrencies({ isActive: true }),
    listWallets({ isActive: true, type: "TILL" }),
    listWallets({ isActive: true, type: "VAULT" }),
  ]);

  const cashWallets: ExternalMoneyCashWalletOption[] = [
    ...tillWallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
      type: "TILL" as const,
    })),
    ...vaultWallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
      type: "VAULT" as const,
    })),
  ];

  const preferred =
    cashWallets.find((wallet) => wallet.label === CASH_TILL_WALLET_NAME) ??
    cashWallets.find((wallet) => wallet.label === MAIN_VAULT_WALLET_NAME) ??
    cashWallets[0];

  return {
    currencies: currencies.map((currency) => ({
      code: currency.code,
      label: formatCurrencyLabel({
        code: currency.code,
        symbol: currency.symbol,
      }),
      symbol: currency.symbol,
    })),
    cashWallets,
    defaultCashWalletId: preferred?.id ?? "",
  };
}
