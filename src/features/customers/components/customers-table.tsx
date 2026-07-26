import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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

function StatusBadge({
  isActive,
  isArchived,
}: {
  isActive: boolean;
  isArchived: boolean;
}) {
  if (isArchived) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
        Archived
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        isActive
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function CustomersTable({
  customers,
  archiveFilter,
  hasFilters,
  onCustomerUpdated,
}: CustomersTableProps) {
  const total = customers.length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
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
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    {displayValue(customer.code)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {customer.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>{displayValue(customer.phone)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate">
                    {displayValue(customer.address)}
                  </TableCell>
                  <TableCell>{formatCreatedDate(customer.createdAt)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      isActive={customer.isActive}
                      isArchived={customer.isArchived}
                    />
                  </TableCell>
                  <TableCell>
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
                </TableRow>
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
