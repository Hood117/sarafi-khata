"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";

type HawalaFiltersProps = {
  search: string;
};

function buildHawalaHref(search: string): string {
  const params = new URLSearchParams();
  const trimmed = search.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  const query = params.toString();
  return query ? `/hawala?${query}` : "/hawala";
}

export function HawalaFilters({ search }: HawalaFiltersProps) {
  const router = useRouter();
  const [query, setQuery] = useState(search);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHawalaHref(query));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="hawala-search" className="font-semibold">
          Search
        </Label>
        <SearchInput
          id="hawala-search"
          name="q"
          value={query}
          placeholder="Search by reference, sender, receiver, partner, city…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Button type="submit" variant="outline" className="h-10">
        Search
      </Button>
    </form>
  );
}
