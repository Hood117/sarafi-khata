import type { TransactionStatus } from "@/generated/prisma/client";
import type {
  TransactionDetail,
  TransactionLedgerEntryRow,
} from "@/features/transactions/domain/types";

export type TransferCustomerOption = {
  id: string;
  label: string;
};

export type TransferCurrencyOption = {
  code: string;
  label: string;
};

export type TransferFormOptions = {
  customers: TransferCustomerOption[];
  currencies: TransferCurrencyOption[];
};

/** One row on the Customer Transfer history table. */
export type TransferHistoryListItem = {
  id: string;
  reference: string;
  senderName: string | null;
  receiverName: string | null;
  currencyCode: string;
  amountDisplay: string;
  operatorName: string | null;
  valueDate: string;
  status: TransactionStatus;
  statusLabel: string;
};

export type GetTransferHistoryOptions = {
  search?: string;
  /** Inclusive lower bound on transaction `valueDate`. */
  valueDateFrom?: Date;
  /** Exclusive upper bound on transaction `valueDate`. */
  valueDateTo?: Date;
  /** Soft cap for non-paginated callers (reports). Default 100. */
  take?: number;
  page?: number;
  pageSize?: number;
};

/**
 * Transfer desk detail. Financial rows come from `getTransactionDetail` —
 * not recalculated here.
 */
export type TransferDetail = {
  id: string;
  reference: string;
  status: TransactionStatus;
  statusLabel: string;
  senderName: string | null;
  receiverName: string | null;
  currencyCode: string;
  amountDisplay: string;
  notes: string | null;
  operatorName: string | null;
  valueDate: string;
  /** Same posted TRANSFER document from getTransactionDetail. */
  relatedTransaction: TransactionDetail;
  /** Ledger lines from the related transaction (source of truth). */
  ledgerEntries: TransactionLedgerEntryRow[];
};
