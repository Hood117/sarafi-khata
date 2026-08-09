"use client";

import { useEffect, useState } from "react";

import { CustomersFilters } from "@/features/customers/components/customers-filters";
import { CustomersPageHeader } from "@/features/customers/components/customers-page-header";
import { CustomersTable } from "@/features/customers/components/customers-table";
import type { CurrencyOption } from "@/features/customers/components/customer-form";
import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";

type CustomersViewProps = {
  customers: CustomerListItem[];
  search: string;
  archiveFilter: CustomerArchiveFilter;
  total: number;
  page: number;
  pageSize: number;
  previousHref: string;
  nextHref: string;
  currencyOptions: CurrencyOption[];
};

export function CustomersView({
  customers,
  search,
  archiveFilter,
  total,
  page,
  pageSize,
  previousHref,
  nextHref,
  currencyOptions,
}: CustomersViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const hasFilters = search.trim().length > 0;

  return (
    <div className="space-y-2">
      <CustomersPageHeader
        currencyOptions={currencyOptions}
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <CustomersFilters search={search} archiveFilter={archiveFilter} />
      <CustomersTable
        customers={customers}
        archiveFilter={archiveFilter}
        hasFilters={hasFilters}
        total={total}
        page={page}
        pageSize={pageSize}
        previousHref={previousHref}
        nextHref={nextHref}
        onCustomerUpdated={setSuccessMessage}
      />
    </div>
  );
}
