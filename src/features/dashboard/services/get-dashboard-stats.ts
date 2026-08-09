import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { countCustomers } from "@/features/customers/repositories/customer-repository";
import {
  buildMonthlyDailySeries,
  buildMonthlyTypeShares,
} from "@/features/dashboard/domain/dashboard-activity";
import {
  countTodayByType,
  localCalendarMonthBounds,
} from "@/features/dashboard/domain/dashboard-stats";
import type {
  DashboardStats,
  GetDashboardStatsOptions,
} from "@/features/dashboard/domain/types";
import { listTransactionTypes } from "@/features/transactions/repositories/transaction-repository";
import { prisma } from "@/server/db";

/**
 * Central read-only dashboard snapshot.
 * Does not post, adjust, or write any financial records.
 */
export async function getDashboardStats(
  options: GetDashboardStatsOptions = {},
): Promise<DashboardStats> {
  await requirePermission("dashboard.view");

  const now = options.now ?? new Date();
  const { start, end, label, monthKey } = localCalendarMonthBounds(now);

  const monthListOptions = {
    status: "POSTED" as const,
    valueDateFrom: start,
    valueDateTo: end,
  };

  const [monthTypes, monthRows, activeCustomers, totalCustomers] =
    await Promise.all([
      listTransactionTypes(monthListOptions),
      prisma.transaction.findMany({
        where: {
          deletedAt: null,
          status: "POSTED",
          valueDate: { gte: start, lt: end },
        },
        select: { valueDate: true, type: true },
        orderBy: { valueDate: "asc" },
      }),
      countCustomers({ archiveFilter: "active" }),
      countCustomers({ archiveFilter: "all" }),
    ]);

  return {
    asOfMonth: label,
    monthKey,
    month: countTodayByType(monthTypes),
    customers: {
      active: activeCustomers,
      total: totalCustomers,
    },
    dailyActivity: buildMonthlyDailySeries(monthRows, start, end),
    typeShares: buildMonthlyTypeShares(monthRows),
  };
}
