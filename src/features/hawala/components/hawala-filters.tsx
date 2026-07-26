"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <Label htmlFor="hawala-search">Search</Label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            id="hawala-search"
            name="q"
            value={query}
            placeholder="Reference, sender, receiver, partner, city…"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
