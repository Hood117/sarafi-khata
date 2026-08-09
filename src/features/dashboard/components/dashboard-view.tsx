import { DashboardActivityChart } from "@/features/dashboard/components/dashboard-activity-chart";
import { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
import { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
import type { DashboardStats } from "@/features/dashboard/domain/types";

type DashboardViewProps = {
  stats: DashboardStats;
};

export function DashboardView({ stats }: DashboardViewProps) {
  return (
    <div className="space-y-4">
      <DashboardSummaryCards
        month={stats.month}
        customers={stats.customers}
        asOfMonth={stats.asOfMonth}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
        <DashboardActivityChart
          asOfMonth={stats.asOfMonth}
          dailyActivity={stats.dailyActivity}
          typeShares={stats.typeShares}
        />
        <DashboardQuickActions />
      </div>
    </div>
  );
}
