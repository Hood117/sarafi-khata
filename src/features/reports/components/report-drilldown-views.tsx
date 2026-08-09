import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ReportDetailShell } from "@/features/reports/components/report-detail-shell";
import { ReportEmptyState } from "@/features/reports/components/report-empty-state";
import {
  buildReportsHref,
  hasActiveReportsFilters,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type {
  ReportExportColumn,
  ReportExportRow,
} from "@/features/reports/domain/report-export";
import type { CustomerStatementOption } from "@/features/reports/domain/types";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { TransactionsTable } from "@/features/transactions/components/transactions-table";

type ReportListDetailLayoutProps = {
  filters: ReportsFilters;
  periodLabel: string;
  title: string;
  description: string;
  empty: boolean;
  children: ReactNode;
  actions?: ReactNode;
  pathname?: string;
  showCustomerFilter?: boolean;
  customerOptions?: CustomerStatementOption[];
  exportFilename: string;
  exportColumns: ReportExportColumn[];
  exportRows: ReportExportRow[];
};

export function ReportListDetailLayout({
  filters,
  periodLabel,
  title,
  description,
  empty,
  children,
  actions,
  pathname,
  showCustomerFilter,
  customerOptions,
  exportFilename,
  exportColumns,
  exportRows,
}: ReportListDetailLayoutProps) {
  const hasFilters = hasActiveReportsFilters(filters);

  return (
    <ReportDetailShell
      title={title}
      description={description}
      filters={filters}
      periodLabel={periodLabel}
      actions={actions}
      pathname={pathname}
      showCustomerFilter={showCustomerFilter}
      customerOptions={customerOptions}
      exportFilename={exportFilename}
      exportColumns={exportColumns}
      exportRows={exportRows}
    >
      {empty ? (
        <div className="bg-card overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <ReportEmptyState hasActiveFilters={hasFilters} />
        </div>
      ) : (
        children
      )}
    </ReportDetailShell>
  );
}

type ReportTransactionsDetailViewProps = {
  filters: ReportsFilters;
  periodLabel: string;
  transactions: TransactionListItem[];
};

export function ReportTransactionsDetailView({
  filters,
  periodLabel,
  transactions,
}: ReportTransactionsDetailViewProps) {
  const returnTo = buildReportsHref(filters, "/reports/transactions");
  const exportColumns: ReportExportColumn[] = [
    { key: "valueDate", header: "Date" },
    { key: "type", header: "Type" },
    { key: "reference", header: "Reference" },
    { key: "customer", header: "Customer" },
    { key: "amount", header: "Amount" },
    { key: "operator", header: "Operator" },
  ];
  const exportRows: ReportExportRow[] = transactions.map((row) => ({
    valueDate: row.valueDate,
    type: row.type,
    reference: row.reference,
    customer: row.customerName ?? "",
    amount: `${row.currencyDisplay} ${row.amountDisplay}`.trim(),
    operator: row.operatorName ?? "",
  }));

  return (
    <ReportListDetailLayout
      filters={filters}
      periodLabel={periodLabel}
      title="Transaction Report"
      description="Full filtered transaction list. Open a row to view the existing transaction detail."
      empty={transactions.length === 0}
      pathname="/reports/transactions"
      exportFilename="transactions-report"
      exportColumns={exportColumns}
      exportRows={exportRows}
    >
      <TransactionsTable transactions={transactions} returnTo={returnTo} />
    </ReportListDetailLayout>
  );
}

/** Opens the existing customer profile (statement detail) with history filters. */
export function OpenCustomerProfileButton({
  customerId,
  filters,
}: {
  customerId: string;
  filters: ReportsFilters;
}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) {
    params.set("from", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("to", filters.dateTo);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.currencyCode) {
    params.set("currency", filters.currencyCode);
  }
  const query = params.toString();
  const href = query
    ? `/customers/${customerId}?${query}`
    : `/customers/${customerId}`;

  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      Open customer profile
    </Button>
  );
}
