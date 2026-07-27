import "server-only";

import { countCustomers } from "@/features/customers/repositories/customer-repository";
import {
  countTodayByType,
  localCalendarDayBounds,
  normalizeRecentLimit,
} from "@/features/dashboard/domain/dashboard-stats";
import type {
  DashboardStats,
  GetDashboardStatsOptions,
} from "@/features/dashboard/domain/types";
import { listTransactionTypes } from "@/features/transactions/repositories/transaction-repository";
import { getTransactionList } from "@/features/transactions/services/list-transactions";
import { getBusinessCashBalances } from "@/features/wallets/services/get-business-cash-balances";

/**
 * Central read-only dashboard snapshot.
 *
 * Reuses transaction list / repo filters, customer counts, and business cash
 * derivation. Does not post, adjust, or write any financial records.
 */
export async function getDashboardStats(
  options: GetDashboardStatsOptions = {},
): Promise<DashboardStats> {
  const now = options.now ?? new Date();
  const { start, end, dateOnly } = localCalendarDayBounds(now);
  const recentLimit = normalizeRecentLimit(options.recentLimit);

  const todayListOptions = {
    status: "POSTED" as const,
    valueDateFrom: start,
    valueDateTo: end,
  };

  const [
    todayTypes,
    recentTransactions,
    activeCustomers,
    totalCustomers,
    businessCash,
  ] = await Promise.all([
    listTransactionTypes(todayListOptions),
    getTransactionList({
      status: "POSTED",
      take: recentLimit,
    }),
    countCustomers({ archiveFilter: "active" }),
    countCustomers({ archiveFilter: "all" }),
    getBusinessCashBalances(),
  ]);

  return {
    asOfDate: dateOnly,
    today: countTodayByType(todayTypes),
    customers: {
      active: activeCustomers,
      total: totalCustomers,
    },
    businessCash,
    recentTransactions,
  };
}
