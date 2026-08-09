import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Typography } from "@/design-system/typography";
import { REPORT_CARDS } from "@/features/reports/domain/report-catalog";
import { toLocalDateOnly } from "@/features/reports/domain/reports-filters";

export function ReportsView() {
  const asOfDate = toLocalDateOnly(new Date());

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Typography variant="h3" as="h2">
          Reports
        </Typography>
        <Typography variant="muted">
          Open a report card for filtered views with print, PDF, and Excel
          export. As of {asOfDate}.
        </Typography>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_CARDS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="bg-card hover:bg-muted/40 focus-visible:ring-ring group flex flex-col rounded-2xl p-4 shadow-sm ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-3"
          >
            <div className="flex items-start justify-between gap-3">
              <Typography variant="h4" className="font-semibold">
                {report.title}
              </Typography>
              <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </div>
            <Typography variant="muted" className="mt-2">
              {report.description}
            </Typography>
          </Link>
        ))}
      </div>
    </div>
  );
}
