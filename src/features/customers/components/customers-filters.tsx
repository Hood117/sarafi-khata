"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import type { CustomerArchiveFilter } from "@/features/customers/domain/types";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState<CustomerArchiveFilter>(archiveFilter);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildCustomersHref(query, status));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="customer-search" className="font-semibold">
          {t.common.search}
        </Label>
        <SearchInput
          id="customer-search"
          name="q"
          value={query}
          placeholder={t.customers.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="customer-status" className="font-semibold">
          {t.common.status}
        </Label>
        <select
          id="customer-status"
          name="status"
          value={status}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          onChange={(event) => {
            const next = event.target.value as CustomerArchiveFilter;
            setStatus(next);
            router.push(buildCustomersHref(query, next));
          }}
        >
          <option value="active">{t.common.active}</option>
          <option value="archived">{t.common.archived}</option>
        </select>
      </div>

      <Button type="submit" variant="outline" className="h-10">
        {t.common.search}
      </Button>
    </form>
  );
}
