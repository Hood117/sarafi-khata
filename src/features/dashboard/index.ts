/**
 * Public API for the dashboard feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Dashboard is read-only. It never posts transactions or writes ledger entries.
 */

export type {
  DashboardCustomerCounts,
  DashboardMonthCounts,
  DashboardStats,
  DashboardTodayCounts,
  GetDashboardStatsOptions,
} from "@/features/dashboard/domain/types";

export type {
  DashboardDailyPoint,
  DashboardTypeShare,
} from "@/features/dashboard/domain/dashboard-activity";

export {
  countTodayByType,
  localCalendarDayBounds,
  localCalendarMonthBounds,
  normalizeRecentLimit,
} from "@/features/dashboard/domain/dashboard-stats";

export { getDashboardStats } from "@/features/dashboard/services/get-dashboard-stats";

export { DashboardView } from "@/features/dashboard/components/dashboard-view";
export { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton";
export { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
export { DashboardActivityChart } from "@/features/dashboard/components/dashboard-activity-chart";
export { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
