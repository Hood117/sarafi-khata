"use client";

import { FileDown, FileSpreadsheet, Printer, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import {
  downloadReportCsv,
  downloadReportExcel,
  downloadReportPdf,
  printReportElement,
  type ReportExportColumn,
  type ReportExportRow,
} from "@/features/reports/domain/report-export";
import type { CustomerStatementOption } from "@/features/reports/domain/types";

type ReportScreenToolbarProps = {
  filters: ReportsFilters;
  /** Base path for this report screen, e.g. `/reports/hawala`. */
  pathname?: string;
  customerOptions?: CustomerStatementOption[];
  showCustomerFilter?: boolean;
  exportTitle: string;
  exportFilename: string;
  exportColumns: ReportExportColumn[];
  exportRows: ReportExportRow[];
  periodLabel?: string;
  actions?: ReactNode;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

export function ReportScreenToolbar({
  filters,
  pathname,
  customerOptions = [],
  showCustomerFilter = false,
  exportTitle,
  exportFilename,
  exportColumns,
  exportRows,
  periodLabel,
  actions,
}: ReportScreenToolbarProps) {
  const router = useRouter();
  const currentPath = usePathname();
  const targetPath = pathname ?? currentPath;

  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [search, setSearch] = useState(filters.search ?? "");
  const [customerId, setCustomerId] = useState(filters.customerId ?? "");

  const exportMeta = {
    title: exportTitle,
    periodLabel:
      periodLabel ??
      ([dateFrom, dateTo].filter(Boolean).join(" → ") || "All dates"),
    generatedAt: new Date().toLocaleString(),
    companyName: "Saraf",
  };

  function apply(next?: {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    customerId?: string;
  }) {
    router.push(
      buildReportsHref(
        {
          dateFrom: next?.dateFrom ?? dateFrom,
          dateTo: next?.dateTo ?? dateTo,
          search: next?.search ?? search,
          customerId: showCustomerFilter
            ? (next?.customerId ?? customerId)
            : filters.customerId,
          currencyCode: filters.currencyCode,
          type: filters.type,
          operatorId: filters.operatorId,
        },
        targetPath,
      ),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply();
  }

  function handleClear() {
    setDateFrom("");
    setDateTo("");
    setSearch("");
    if (showCustomerFilter) {
      setCustomerId("");
    }
    apply({
      dateFrom: "",
      dateTo: "",
      search: "",
      customerId: showCustomerFilter ? "" : (filters.customerId ?? ""),
    });
  }

  return (
    <div className="space-y-3 print:hidden">
      <form
        onSubmit={handleSubmit}
        className="bg-card ring-foreground/10 space-y-3 rounded-xl p-3 shadow-sm ring-1"
        aria-label="Report filters"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-date-from">Start date</Label>
            <Input
              id="report-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-date-to">End date</Label>
            <Input
              id="report-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="report-search">Search</Label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="report-search"
                type="search"
                placeholder="Search this report…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          {showCustomerFilter ? (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="report-customer">Customer</Label>
              <select
                id="report-customer"
                value={customerId}
                className={selectClassName}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Select a customer</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => printReportElement()}
        >
          <Printer data-icon="inline-start" />
          Print
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadReportPdf(exportTitle, exportColumns, exportRows, exportMeta)
          }
        >
          <FileDown data-icon="inline-start" />
          PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadReportExcel(
              exportFilename,
              exportColumns,
              exportRows,
              exportMeta,
            )
          }
        >
          <FileSpreadsheet data-icon="inline-start" />
          Excel
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            downloadReportCsv(
              exportFilename,
              exportColumns,
              exportRows,
              exportMeta,
            )
          }
        >
          CSV
        </Button>
        {actions}
      </div>
    </div>
  );
}
