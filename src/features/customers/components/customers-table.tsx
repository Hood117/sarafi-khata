"use client";

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
import { Typography } from "@/design-system/typography";
import { CustomersEmptyState } from "@/features/customers/components/customers-empty-state";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";

type CustomersTableProps = {
  customers: CustomerListItem[];
  archiveFilter: CustomerArchiveFilter;
  hasFilters: boolean;
  onCustomerUpdated?: (message: string) => void;
};

function formatCreatedDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

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

function customerStatusLabel(customer: CustomerListItem) {
  if (customer.isArchived) {
    return "Archived";
  }
  return customer.isActive ? "Active" : "Inactive";
}

export function CustomersTable({
  customers,
  archiveFilter,
  hasFilters,
  onCustomerUpdated,
}: CustomersTableProps) {
  const total = customers.length;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <CustomersEmptyState
            hasFilters={hasFilters}
            viewingArchived={archiveFilter === "archived"}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Customer Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <ClickableTableRow
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                >
                  <TableCell className="font-semibold">
                    {displayValue(customer.code)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {customer.fullName}
                  </TableCell>
                  <TableCell>{displayValue(customer.phone)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate">
                    {displayValue(customer.address)}
                  </TableCell>
                  <TableCell>{formatCreatedDate(customer.createdAt)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={customerStatusLabel(customer)}
                      tone={customerStatusTone(customer)}
                    />
                  </TableCell>
                  <TableCell data-row-click-ignore>
                    {customer.isArchived ? (
                      <Button variant="ghost" size="sm" disabled>
                        Edit
                      </Button>
                    ) : (
                      <EditCustomerDialog
                        customerId={customer.id}
                        onSuccess={onCustomerUpdated}
                      />
                    )}
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography variant="muted">
          {total === 0
            ? "No customers to display"
            : `Showing ${total} customer${total === 1 ? "" : "s"}`}
        </Typography>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
