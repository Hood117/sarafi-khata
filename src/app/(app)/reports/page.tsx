import { Suspense } from "react";

import {
  getReportsPageData,
  parseReportsFiltersFromSearchParams,
  ReportsSkeleton,
  ReportsView,
} from "@/features/reports";

type ReportsPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    customerId?: string | string[];
    currency?: string | string[];
    type?: string | string[];
    operator?: string | string[];
  }>;
};

async function ReportsPageContent({
  searchParams,
}: {
  searchParams: Awaited<ReportsPageProps["searchParams"]>;
}) {
  const filters = parseReportsFiltersFromSearchParams(searchParams);
  const data = await getReportsPageData({ filters });

  return <ReportsView data={data} />;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const suspenseKey = [
    params.from,
    params.to,
    params.customerId,
    params.currency,
    params.type,
    params.operator,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value ?? ""]))
    .join("|");

  return (
    <Suspense key={suspenseKey} fallback={<ReportsSkeleton />}>
      <ReportsPageContent searchParams={params} />
    </Suspense>
  );
}
