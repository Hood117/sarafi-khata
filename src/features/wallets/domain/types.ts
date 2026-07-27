import type { WalletType } from "@/generated/prisma/client";

export type WalletArchiveFilter = "active" | "archived";

export type WalletInput = {
  name: string;
  type: WalletType;
  customerId?: string | null;
};

export type WalletListItem = {
  id: string;
  name: string;
  type: WalletType;
  /** Display-only note for known system/operating wallets. */
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WalletDetail = WalletListItem;

export type WalletCustomerOption = {
  id: string;
  label: string;
};

export type WalletFormData = {
  id: string;
  name: string;
  type: WalletType;
  customerId: string | null;
};

/** One display row for a customer wallet balance (wallet × currency). */
export type CustomerWalletBalanceRow = {
  walletId: string;
  walletName: string;
  currencyCode: string;
  /** Formatted major units, e.g. "0.00". */
  balanceDisplay: string;
  isActive: boolean;
  isArchived: boolean;
};

/**
 * Balance for one currency, aggregated from ledger entries.
 * Used for customer profiles and business cash overview.
 */
export type CurrencyBalanceDisplay = {
  currencyCode: string;
  /** Formatted major units with grouping, e.g. "25,000" or "500.50". */
  balanceDisplay: string;
};

export type CustomerCurrencyBalance = CurrencyBalanceDisplay;

export type BusinessCashBalance = CurrencyBalanceDisplay;
