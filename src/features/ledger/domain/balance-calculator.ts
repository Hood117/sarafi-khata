import type { CurrencyCode } from "@/features/ledger/domain/currency";
import type {
  BalanceCalculator,
  BalanceKey,
} from "@/features/ledger/domain/balance";
import type {
  CurrencyBalance,
  WalletCurrencyBalance,
} from "@/features/ledger/domain/ledger-types";
import { createMoney, type Money } from "@/features/ledger/domain/money";
import {
  summarizeByCurrency,
  validateLedgerEntries,
} from "@/features/ledger/domain/validation";

function walletCurrencyKey(walletId: string, currency: CurrencyCode) {
  return `${walletId}::${currency}`;
}

export function createBalanceCalculator(): BalanceCalculator {
  return {
    calculateWalletBalances(entries) {
      validateLedgerEntries(entries);

      const totals = new Map<string, { walletId: string; currency: CurrencyCode; net: bigint }>();

      for (const entry of entries) {
        const key = walletCurrencyKey(entry.walletId, entry.currency);
        const current = totals.get(key) ?? {
          walletId: entry.walletId,
          currency: entry.currency,
          net: BigInt(0),
        };

        current.net +=
          entry.direction === "DEBIT"
            ? entry.amount.amountMinor
            : -entry.amount.amountMinor;

        totals.set(key, current);
      }

      return [...totals.values()].map(
        (item): WalletCurrencyBalance => ({
          walletId: item.walletId,
          currency: item.currency,
          balance: createMoney(item.net, item.currency),
        }),
      );
    },

    summarizeCurrencies(entries): CurrencyBalance[] {
      return summarizeByCurrency(entries);
    },

    getBalance(entries, key: BalanceKey): Money {
      const balances = this.calculateWalletBalances(entries);
      const found = balances.find(
        (item) =>
          item.walletId === key.walletId && item.currency === key.currency,
      );

      return found?.balance ?? createMoney(BigInt(0), key.currency);
    },
  };
}
