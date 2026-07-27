import { Suspense } from "react";

import {
  DashboardSkeleton,
  DashboardView,
  getDashboardStats,
} from "@/features/dashboard";

async function DashboardPageContent() {
  const stats = await getDashboardStats();
  return <DashboardView stats={stats} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}
