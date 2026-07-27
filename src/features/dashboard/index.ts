/**
 * Public API for the dashboard feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Dashboard is read-only. It never posts transactions or writes ledger entries.
 */

export type {
  DashboardCustomerCounts,
  DashboardStats,
  DashboardTodayCounts,
  GetDashboardStatsOptions,
} from "@/features/dashboard/domain/types";

export {
  countTodayByType,
  localCalendarDayBounds,
  normalizeRecentLimit,
} from "@/features/dashboard/domain/dashboard-stats";

export { getDashboardStats } from "@/features/dashboard/services/get-dashboard-stats";

export { DashboardView } from "@/features/dashboard/components/dashboard-view";
export { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton";
export { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
export { DashboardBusinessCash } from "@/features/dashboard/components/dashboard-business-cash";
export { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
export { DashboardRecentActivity } from "@/features/dashboard/components/dashboard-recent-activity";
