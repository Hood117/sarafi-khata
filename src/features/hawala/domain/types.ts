import type {
  HawalaDirection,
  HawalaStatus,
  HawalaTransfer,
} from "@/generated/prisma/client";
import type {
  TransactionDetail,
  TransactionLedgerEntryRow,
} from "@/features/transactions/domain/types";

export type { HawalaDirection, HawalaStatus };

/** How a hawala party is captured in the UI. */
export type HawalaPartySource = "customer" | "external";

/** Business fields shared by send and receive hawala requests. */
export type HawalaPartyInput = {
  senderName: string;
  senderPhone?: string | null;
  receiverName: string;
  receiverPhone?: string | null;
  /** When set, sender is an existing local customer (name/phone resolved server-side). */
  senderCustomerId?: string | null;
  /** When set, receiver is an existing local customer (name/phone resolved server-side). */
  receiverCustomerId?: string | null;
  partnerSarafi: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  reference: string;
  currencyCode: string;
  /** Major-unit decimal string, e.g. "100.50". */
  amount: string;
  notes?: string | null;
  /**
   * Optional primary local customer for the posted Transaction.
   * Derived from sender/receiver customer links when omitted.
   */
  customerId?: string | null;
  /** Vault/till for the cash leg. */
  cashWalletId: string;
  /** SYSTEM clearing wallet for the contra leg. */
  clearingWalletId: string;
  valueDate?: Date;
};

export type SendHawalaInput = HawalaPartyInput & {
  createdById: string;
};

export type ReceiveHawalaInput = HawalaPartyInput & {
  createdById: string;
};

export type HawalaTransferRecord = HawalaTransfer;

/** Row model for the hawala list page. */
export type HawalaListItem = {
  id: string;
  reference: string;
  direction: HawalaDirection;
  senderName: string;
  receiverName: string;
  partnerSarafi: string;
  originDisplay: string;
  destinationDisplay: string;
  currencyCode: string;
  amountDisplay: string;
  status: HawalaStatus;
  statusLabel: string;
  operatorName: string | null;
  valueDate: string;
};

export type HawalaCustomerOption = {
  id: string;
  label: string;
  fullName: string;
  phone: string | null;
};

export type HawalaWalletOption = {
  id: string;
  label: string;
};

export type HawalaCurrencyOption = {
  code: string;
  label: string;
};

export type HawalaFormOptions = {
  customers: HawalaCustomerOption[];
  cashWallets: HawalaWalletOption[];
  clearingWallets: HawalaWalletOption[];
  currencies: HawalaCurrencyOption[];
};

export type GetHawalaListOptions = {
  search?: string;
};

/** Status lifecycle event for the hawala detail timeline. */
export type HawalaTimelineEvent = {
  id: string;
  label: string;
  at: string;
  status: HawalaStatus | null;
  statusLabel: string | null;
};

/**
 * Hawala detail view model.
 * Related financial rows come from the existing transaction detail service —
 * not recalculated here.
 */
export type HawalaDetail = {
  id: string;
  reference: string;
  direction: HawalaDirection;
  directionLabel: string;
  status: HawalaStatus;
  statusLabel: string;
  senderName: string;
  senderPhone: string | null;
  senderCustomerId: string | null;
  senderCustomerDisplay: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverCustomerId: string | null;
  receiverCustomerDisplay: string | null;
  partnerSarafi: string;
  originDisplay: string;
  destinationDisplay: string;
  currencyCode: string;
  amountDisplay: string;
  notes: string | null;
  customerId: string | null;
  /** Primary local customer label when linked for the posted document. */
  customerDisplay: string | null;
  operatorName: string | null;
  valueDate: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  timeline: HawalaTimelineEvent[];
  /** Posted document from getTransactionDetail, when linked. */
  relatedTransaction: TransactionDetail | null;
  /** Ledger lines from the related transaction (source of truth). */
  ledgerEntries: TransactionLedgerEntryRow[];
};
