"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <Label htmlFor="customer-search">Search</Label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            id="customer-search"
            name="q"
            value={query}
            placeholder="Name, phone, or customer code"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="customer-status">Status</Label>
        <select
          id="customer-status"
          name="status"
          value={status}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
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

      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
