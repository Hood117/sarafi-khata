import type {
  DashboardDailyPoint,
  DashboardTypeShare,
} from "@/features/dashboard/domain/dashboard-activity";

/** Counts of posted transactions whose valueDate falls in the dashboard month. */
export type DashboardMonthCounts = {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
};

/** @deprecated Prefer DashboardMonthCounts */
export type DashboardTodayCounts = DashboardMonthCounts;

export type DashboardCustomerCounts = {
  active: number;
  total: number;
};

/**
 * Read-only dashboard snapshot. Never posts money or mutates financial records.
 */
export type DashboardStats = {
  /** Local calendar month label (e.g. "July 2026"). */
  asOfMonth: string;
  /** Local calendar month key (`YYYY-MM`). */
  monthKey: string;
  month: DashboardMonthCounts;
  customers: DashboardCustomerCounts;
  /** Posted count per calendar day in the current month. */
  dailyActivity: DashboardDailyPoint[];
  /** Type mix for the current month. */
  typeShares: DashboardTypeShare[];
};

export type GetDashboardStatsOptions = {
  /** Override “now” for tests / deterministic month bounds. */
  now?: Date;
};
