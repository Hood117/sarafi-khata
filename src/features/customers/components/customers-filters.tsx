"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import type { CustomerArchiveFilter } from "@/features/customers/domain/types";

type CustomersFiltersProps = {
  search: string;
  archiveFilter: CustomerArchiveFilter;
};

function buildCustomersHref(
  search: string,
  archiveFilter: CustomerArchiveFilter,
): string {
  const params = new URLSearchParams();
  const trimmed = search.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  if (archiveFilter === "archived") {
    params.set("status", "archived");
  }

  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomersFilters({
  search,
  archiveFilter,
}: CustomersFiltersProps) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState<CustomerArchiveFilter>(archiveFilter);

  function applyFilters(
    nextSearch: string,
    nextArchiveFilter: CustomerArchiveFilter,
  ) {
    router.push(buildCustomersHref(nextSearch, nextArchiveFilter));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(query, status);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="customer-search" className="font-semibold">
          Search
        </Label>
        <SearchInput
          id="customer-search"
          name="q"
          value={query}
          placeholder="Search by name, phone, or customer code…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="customer-status" className="font-semibold">
          Status
        </Label>
        <select
          id="customer-status"
          name="status"
          value={status}
          className="border-input bg-background focus-visible:border-primary-light focus-visible:ring-primary-light/40 h-10 w-full rounded-lg border px-2.5 text-sm shadow-sm outline-none focus-visible:ring-3"
          onChange={(event) => {
            const nextStatus = event.target.value as CustomerArchiveFilter;
            setStatus(nextStatus);
            applyFilters(query, nextStatus);
          }}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <Button type="submit" variant="outline" className="h-10">
        Search
      </Button>
    </form>
  );
}
