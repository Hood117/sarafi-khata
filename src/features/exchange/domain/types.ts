import type { TransactionStatus, WalletType } from "@/generated/prisma/client";
import type {
  TransactionDetail,
  TransactionLedgerEntryRow,
} from "@/features/transactions/domain/types";

export type ExchangeCustomerOption = {
  id: string;
  label: string;
};

export type ExchangeWalletOption = {
  id: string;
  label: string;
  type: WalletType;
  customerId: string | null;
};

export type ExchangeCurrencyOption = {
  code: string;
  label: string;
  decimalPlaces: number;
};

/** Active Settings rate for client-side pair lookup (quote per 1 base). */
export type ExchangeRateOption = {
  id: string;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rate: string;
  effectiveAt: string;
};

export type ExchangeFormOptions = {
  customers: ExchangeCustomerOption[];
  wallets: ExchangeWalletOption[];
  currencies: ExchangeCurrencyOption[];
  rates: ExchangeRateOption[];
  allowManualRateOverride: boolean;
};

/** One row on the Currency Exchange history table. */
export type ExchangeHistoryListItem = {
  id: string;
  reference: string;
  customerName: string | null;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  amountDisplay: string;
  exchangeRateDisplay: string;
  convertedAmountDisplay: string;
  operatorName: string | null;
  valueDate: string;
};

export type GetExchangeHistoryOptions = {
  search?: string;
  /** Inclusive lower bound on transaction `valueDate`. */
  valueDateFrom?: Date;
  /** Exclusive upper bound on transaction `valueDate`. */
  valueDateTo?: Date;
};

/**
 * Exchange desk detail. Financial rows come from `getTransactionDetail` —
 * not recalculated here.
 */
export type ExchangeDetail = {
  id: string;
  reference: string;
  status: TransactionStatus;
  statusLabel: string;
  customerName: string | null;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  originalAmountDisplay: string;
  exchangeRateDisplay: string;
  convertedAmountDisplay: string;
  notes: string | null;
  operatorName: string | null;
  valueDate: string;
  /** Same posted EXCHANGE document from getTransactionDetail. */
  relatedTransaction: TransactionDetail;
  /** Ledger lines from the related transaction (source of truth). */
  ledgerEntries: TransactionLedgerEntryRow[];
};
