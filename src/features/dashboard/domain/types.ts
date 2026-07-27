import type { TransactionListItem } from "@/features/transactions/domain/types";
import type { BusinessCashBalance } from "@/features/wallets/domain/types";

/** Counts of posted transactions whose valueDate falls on the dashboard day. */
export type DashboardTodayCounts = {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
};

export type DashboardCustomerCounts = {
  active: number;
  total: number;
};

/**
 * Read-only dashboard snapshot. Never posts money or mutates financial records.
 */
export type DashboardStats = {
  /** Local calendar day (`YYYY-MM-DD`) used for “today” bounds. */
  asOfDate: string;
  today: DashboardTodayCounts;
  customers: DashboardCustomerCounts;
  businessCash: BusinessCashBalance[];
  recentTransactions: TransactionListItem[];
};

export type GetDashboardStatsOptions = {
  /** How many recent posted transactions to include (default 10, max 50). */
  recentLimit?: number;
  /** Override “now” for tests / deterministic day bounds. */
  now?: Date;
};
