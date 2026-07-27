import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  buildReportsHref,
  inclusiveDateFiltersFromBounds,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { PeriodActivityReport } from "@/features/reports/domain/types";

type ReportViewAllLinkProps = {
  href: string;
  label?: string;
};

export function ReportViewAllLink({
  href,
  label = "View all",
}: ReportViewAllLinkProps) {
  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      {label}
    </Button>
  );
}

/** Builds a drill-in href for a period activity section (daily/monthly/range). */
export function buildPeriodTransactionsDrilldownHref(
  filters: ReportsFilters,
  report: PeriodActivityReport,
): string {
  const start = new Date(report.periodStart);
  const endExclusive = new Date(report.periodEndExclusive);
  const dates = inclusiveDateFiltersFromBounds(start, endExclusive);

  return buildReportsHref(
    {
      ...filters,
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
    },
    "/reports/transactions",
  );
}
