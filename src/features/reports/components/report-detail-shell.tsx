import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";

type ReportDetailShellProps = {
  title: string;
  description: string;
  filters: ReportsFilters;
  periodLabel: string;
  children: ReactNode;
  /** Extra actions in the header row (e.g. open customer profile). */
  actions?: ReactNode;
};

function FilterChip({ label }: { label: string }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex rounded-md px-2 py-1 text-xs">
      {label}
    </span>
  );
}

export function ReportDetailShell({
  title,
  description,
  filters,
  periodLabel,
  children,
  actions,
}: ReportDetailShellProps) {
  const backHref = buildReportsHref(filters);
  const chips: string[] = [`Period: ${periodLabel}`];

  if (filters.customerId) {
    chips.push("Customer filtered");
  }
  if (filters.currencyCode) {
    chips.push(`Currency: ${filters.currencyCode}`);
  }
  if (filters.type) {
    chips.push(`Type: ${filters.type}`);
  }
  if (filters.operatorId) {
    chips.push("Operator filtered");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={backHref} />}
            className="text-muted-foreground -ml-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to reports
          </Button>

          <div className="space-y-2">
            <Typography variant="h3" as="h2">
              {title}
            </Typography>
            <Typography variant="muted">{description}</Typography>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <FilterChip key={chip} label={chip} />
              ))}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}
