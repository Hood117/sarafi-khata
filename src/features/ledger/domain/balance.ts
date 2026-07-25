import type { CurrencyCode } from "@/features/ledger/domain/currency";
import type {
  CurrencyBalance,
  LedgerEntryInput,
  WalletCurrencyBalance,
} from "@/features/ledger/domain/ledger-types";
import type { Money } from "@/features/ledger/domain/money";

/**
 * Query key for a wallet balance in one currency.
 */
export type BalanceKey = {
  walletId: string;
  currency: CurrencyCode;
};

/**
 * Point-in-time balance for one wallet + currency.
 */
export type BalanceSnapshot = {
  key: BalanceKey;
  balance: Money;
};

/**
 * Pure balance calculation over in-memory ledger lines.
 * Implementations must not touch the database.
 */
export interface BalanceCalculator {
  /**
   * Net balance per wallet and currency.
   * Convention: DEBIT increases balance, CREDIT decreases balance.
   */
  calculateWalletBalances(
    entries: readonly LedgerEntryInput[],
  ): WalletCurrencyBalance[];

  /** Debit/credit totals and net per currency across all wallets. */
  summarizeCurrencies(
    entries: readonly LedgerEntryInput[],
  ): CurrencyBalance[];

  /** Balance for a single wallet + currency key, or zero money if absent. */
  getBalance(
    entries: readonly LedgerEntryInput[],
    key: BalanceKey,
  ): Money;
}

/**
 * Optional read-model port for future infrastructure adapters.
 * Domain only declares the contract — no DB wiring here.
 */
export interface BalanceReadModel {
  getWalletBalance(key: BalanceKey): Promise<Money>;
  listWalletBalances(walletId: string): Promise<WalletCurrencyBalance[]>;
}
