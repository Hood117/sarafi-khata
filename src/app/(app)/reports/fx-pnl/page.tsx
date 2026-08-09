import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { FxPnlReportSection } from "@/features/reports/components/fx-pnl-report-section";
import { getFxPnlReport } from "@/features/reports/services/get-fx-pnl-report";

type FxPnlReportPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function parseDayStart(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }
  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDayEndExclusive(value: string): Date | undefined {
  const start = parseDayStart(value);
  if (!start) {
    return undefined;
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return end;
}

export default async function FxPnlReportPage({
  searchParams,
}: FxPnlReportPageProps) {
  await requirePermission("reports.view");
  const params = await searchParams;
  const from = parseDayStart(firstValue(params.from));
  const to = parseDayEndExclusive(firstValue(params.to));
  const report = await getFxPnlReport({ from, to });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/reports" />}
          className="text-muted-foreground -ml-2 w-fit"
        >
          <ArrowLeft data-icon="inline-start" />
          Back to reports
        </Button>
        <div className="space-y-1">
          <Typography variant="h2">FX Gain / Loss</Typography>
          <Typography variant="muted">
            Exchange Difference wallet P&amp;L by currency. Optional filters:
            ?from=YYYY-MM-DD&amp;to=YYYY-MM-DD
          </Typography>
        </div>
      </div>
      <FxPnlReportSection report={report} />
    </div>
  );
}
