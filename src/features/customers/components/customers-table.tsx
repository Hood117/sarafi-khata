"use client";

import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomersEmptyState } from "@/features/customers/components/customers-empty-state";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type CustomersTableProps = {
  customers: CustomerListItem[];
  archiveFilter: CustomerArchiveFilter;
  hasFilters: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  previousHref?: string;
  nextHref?: string;
  onCustomerUpdated?: (message: string) => void;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function customerStatusTone(customer: CustomerListItem) {
  if (customer.isArchived) {
    return toneForRecordStatus("ARCHIVED");
  }
  return toneForRecordStatus(customer.isActive ? "ACTIVE" : "INACTIVE");
}

const actionButtonClass =
  "h-8 shrink-0 whitespace-nowrap px-2.5 text-xs font-semibold";

export function CustomersTable({
  customers,
  archiveFilter,
  hasFilters,
  total,
  page = 1,
  pageSize = 25,
  previousHref,
  nextHref,
  onCustomerUpdated,
}: CustomersTableProps) {
  const t = useT();
  const showing = customers.length;
  const resolvedTotal = total ?? showing;
  const paginated =
    previousHref != null && nextHref != null && total != null;

  function customerStatusLabel(customer: CustomerListItem) {
    if (customer.isArchived) {
      return t.common.archived;
    }
    return customer.isActive ? t.common.active : t.common.inactive;
  }

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <CustomersEmptyState
            hasFilters={hasFilters}
            viewingArchived={archiveFilter === "archived"}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.name}</TableHead>
                <TableHead>{t.customers.fatherName}</TableHead>
                <TableHead>{t.common.phone}</TableHead>
                <TableHead>{t.common.address}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-[1%] whitespace-nowrap text-end">
                  {t.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <ClickableTableRow
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                >
                  <TableCell className="font-medium">
                    {customer.fullName}
                  </TableCell>
                  <TableCell>{displayValue(customer.fatherName)}</TableCell>
                  <TableCell>{displayValue(customer.phone)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate">
                    {displayValue(customer.address)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={customerStatusLabel(customer)}
                      tone={customerStatusTone(customer)}
                    />
                  </TableCell>
                  <TableCell data-row-click-ignore>
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          actionButtonClass,
                          "bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary",
                        )}
                        render={
                          <Link
                            href={`/customers/${customer.id}?tab=balances`}
                          />
                        }
                      >
                        {t.customers.balances}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          actionButtonClass,
                          "bg-accent/25 text-accent-foreground hover:bg-accent/40",
                        )}
                        render={
                          <Link
                            href={`/customers/${customer.id}?tab=history`}
                          />
                        }
                      >
                        {t.customers.history}
                      </Button>
                      {customer.isArchived ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className={actionButtonClass}
                        >
                          {t.common.edit}
                        </Button>
                      ) : (
                        <EditCustomerDialog
                          customerId={customer.id}
                          onSuccess={onCustomerUpdated}
                          triggerClassName={cn(
                            actionButtonClass,
                            "bg-primary-dark/10 text-primary-dark hover:bg-primary-dark/18 hover:text-primary-dark",
                          )}
                        />
                      )}
                    </div>
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {paginated ? (
        <ListPagination
          total={resolvedTotal}
          page={page}
          pageSize={pageSize}
          showing={showing}
          previousHref={previousHref}
          nextHref={nextHref}
          emptyLabel={t.common.noResults}
          ariaLabel="Customer pagination"
        />
      ) : (
        <div className="text-muted-foreground text-sm">
          {showing === 0
            ? t.common.noResults
            : `${t.common.showing} ${showing}`}
        </div>
      )}
    </div>
  );
}
