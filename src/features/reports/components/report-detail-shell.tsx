import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import { ReportScreenToolbar } from "@/features/reports/components/report-screen-toolbar";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type {
  ReportExportColumn,
  ReportExportRow,
} from "@/features/reports/domain/report-export";
import type { CustomerStatementOption } from "@/features/reports/domain/types";

type ReportDetailShellProps = {
  title: string;
  description: string;
  filters: ReportsFilters;
  periodLabel: string;
  children: ReactNode;
  /** Extra actions in the toolbar row (e.g. open customer profile). */
  actions?: ReactNode;
  pathname?: string;
  showCustomerFilter?: boolean;
  customerOptions?: CustomerStatementOption[];
  exportFilename: string;
  exportColumns: ReportExportColumn[];
  exportRows: ReportExportRow[];
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
  pathname,
  showCustomerFilter = false,
  customerOptions = [],
  exportFilename,
  exportColumns,
  exportRows,
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
  if (filters.search) {
    chips.push(`Search: ${filters.search}`);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 print:hidden">
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

      <ReportScreenToolbar
        filters={filters}
        pathname={pathname}
        showCustomerFilter={showCustomerFilter}
        customerOptions={customerOptions}
        exportTitle={title}
        exportFilename={exportFilename}
        exportColumns={exportColumns}
        exportRows={exportRows}
        periodLabel={periodLabel}
        actions={actions}
      />

      <div id="report-print-root" className="report-print-root space-y-3">
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm">{description}</p>
          <p className="text-sm">Period: {periodLabel}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
