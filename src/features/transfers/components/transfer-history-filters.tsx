"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";

type TransferHistoryFiltersProps = {
  search: string;
};

function buildTransferHref(search: string): string {
  const params = new URLSearchParams();
  const trimmed = search.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  const query = params.toString();
  return query ? `/transfers?${query}` : "/transfers";
}

export function TransferHistoryFilters({
  search,
}: TransferHistoryFiltersProps) {
  const router = useRouter();
  const [query, setQuery] = useState(search);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildTransferHref(query));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="transfer-history-search" className="font-semibold">
          Search
        </Label>
        <SearchInput
          id="transfer-history-search"
          name="q"
          value={query}
          placeholder="Search by reference, sender, receiver, currency, operator…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Button type="submit" variant="outline" className="h-10">
        Search
      </Button>
    </form>
  );
}
