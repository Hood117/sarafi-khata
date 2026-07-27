"use client";

import { useEffect, useState } from "react";

import { CustomersFilters } from "@/features/customers/components/customers-filters";
import { CustomersPageHeader } from "@/features/customers/components/customers-page-header";
import { CustomersTable } from "@/features/customers/components/customers-table";
import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";

type CustomersViewProps = {
  customers: CustomerListItem[];
  search: string;
  archiveFilter: CustomerArchiveFilter;
};

export function CustomersView({
  customers,
  search,
  archiveFilter,
}: CustomersViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasFilters = search.trim().length > 0;

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  return (
    <div className="space-y-2">
      <CustomersPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <CustomersFilters
        key={`${search}:${archiveFilter}`}
        search={search}
        archiveFilter={archiveFilter}
      />
      <CustomersTable
        customers={customers}
        archiveFilter={archiveFilter}
        hasFilters={hasFilters}
        onCustomerUpdated={setSuccessMessage}
      />
    </div>
  );
}
