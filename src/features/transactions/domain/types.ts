import type { LedgerEntryInput } from "@/features/ledger/domain";
import type {
  LedgerEntry,
  Transaction,
  TransactionStatus,
  TransactionType,
  WalletType,
} from "@/generated/prisma/client";

/**
 * One ledger line for posting. Extends domain LedgerEntryInput with optional FX link.
 * Future deposit/withdrawal/exchange/hawala flows must build these lines — never write ledger rows directly.
 */
export type PostingLineInput = LedgerEntryInput & {
  exchangeRateId?: string | null;
};

/** Row model for the transactions list page. */
export type TransactionListItem = {
  id: string;
  reference: string;
  type: TransactionType;
  customerName: string | null;
  currencyDisplay: string;
  amountDisplay: string;
  status: TransactionStatus;
  operatorName: string | null;
  valueDate: string;
};

/** One ledger line on the transaction detail / receipt. */
export type TransactionLedgerEntryRow = {
  id: string;
  walletName: string;
  currencyCode: string;
  direction: "DEBIT" | "CREDIT";
  amountDisplay: string;
  memo: string | null;
};

/** Full transaction detail for the detail page and printable receipt. */
export type TransactionDetail = {
  id: string;
  reference: string;
  type: TransactionType;
  typeLabel: string;
  status: TransactionStatus;
  statusLabel: string;
  customerId: string | null;
  customerName: string | null;
  /** Wallet names involved in the posting (comma-separated). */
  walletDisplay: string;
  currencyDisplay: string;
  amountDisplay: string;
  notes: string | null;
  operatorName: string | null;
  valueDate: string;
  postedAt: string | null;
  createdAt: string;
  appName: string;
  ledgerEntries: TransactionLedgerEntryRow[];
};

export type TransactionFormType = "DEPOSIT" | "WITHDRAWAL" | "ADJUSTMENT";

/** Sort order for customer financial history. */
export type CustomerHistorySort = "newest" | "oldest";

/**
 * Applied (normalized) filters for customer financial history.
 * Date fields use `YYYY-MM-DD` calendar strings.
 */
export type CustomerHistoryFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  type: TransactionType | null;
  currencyCode: string | null;
  reference: string | null;
};

/**
 * One read-only history event: a ledger line on a customer wallet,
 * joined with its parent transaction metadata.
 */
export type CustomerHistoryEvent = {
  id: string;
  transactionId: string;
  date: string;
  type: TransactionType;
  typeLabel: string;
  reference: string;
  currencyCode: string;
  amountDisplay: string;
  direction: "DEBIT" | "CREDIT";
  status: TransactionStatus;
  statusLabel: string;
  operatorName: string | null;
};

export type CustomerHistoryResult = {
  events: CustomerHistoryEvent[];
  total: number;
  page: number;
  pageSize: number;
  sort: CustomerHistorySort;
  filters: CustomerHistoryFilters;
  /** Currency codes available for the filter UI (from the currencies already loaded). */
  currencyOptions: string[];
};

export type GetCustomerHistoryOptions = {
  page?: number;
  pageSize?: number;
  sort?: CustomerHistorySort;
  /** Inclusive start date (`YYYY-MM-DD`). */
  dateFrom?: string;
  /** Inclusive end date (`YYYY-MM-DD`). */
  dateTo?: string;
  type?: TransactionType | string;
  currencyCode?: string;
  reference?: string;
};

export type TransactionCustomerOption = {
  id: string;
  label: string;
};

export type TransactionWalletOption = {
  id: string;
  label: string;
  type: WalletType;
  customerId: string | null;
};

export type TransactionCurrencyOption = {
  code: string;
  label: string;
};

export type TransactionFormOptions = {
  customers: TransactionCustomerOption[];
  wallets: TransactionWalletOption[];
  currencies: TransactionCurrencyOption[];
};

/**
 * Request accepted by the financial posting service (single entry point for money movement).
 */
export type PostTransactionInput = {
  reference: string;
  type: TransactionType;
  valueDate: Date;
  entries: PostingLineInput[];
  customerId?: string | null;
  description?: string | null;
  createdById?: string | null;
};

/** Posted document plus the append-only ledger lines created with it. */
export type PostedTransaction = Transaction & {
  ledgerEntries: LedgerEntry[];
};
