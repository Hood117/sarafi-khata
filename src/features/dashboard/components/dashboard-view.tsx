import { Typography } from "@/design-system/typography";
import { DashboardBusinessCash } from "@/features/dashboard/components/dashboard-business-cash";
import { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
import { DashboardRecentActivity } from "@/features/dashboard/components/dashboard-recent-activity";
import { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
import type { DashboardStats } from "@/features/dashboard/domain/types";

type DashboardViewProps = {
  stats: DashboardStats;
};

export function DashboardView({ stats }: DashboardViewProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <Typography variant="h3" as="h2">
          Dashboard
        </Typography>
        <Typography variant="muted">
          Today&apos;s activity, business cash, and shortcuts into desk
          workflows.
        </Typography>
      </div>

      <DashboardSummaryCards
        today={stats.today}
        customers={stats.customers}
        asOfDate={stats.asOfDate}
      />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <DashboardBusinessCash balances={stats.businessCash} />
        <DashboardQuickActions />
      </div>

      <DashboardRecentActivity transactions={stats.recentTransactions} />
    </div>
  );
}
