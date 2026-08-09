"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { useT } from "@/lib/i18n";

type HawalaArchiveFilter = "active" | "archived";

type HawalaFiltersProps = {
  search: string;
  archiveFilter: HawalaArchiveFilter;
};

function buildHawalaHref(
  search: string,
  archiveFilter: HawalaArchiveFilter,
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
  return query ? `/hawala?${query}` : "/hawala";
}

export function HawalaFilters({
  search,
  archiveFilter,
}: HawalaFiltersProps) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState<HawalaArchiveFilter>(archiveFilter);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHawalaHref(query, status));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="hawala-search" className="font-semibold">
          {t.common.search}
        </Label>
        <SearchInput
          id="hawala-search"
          name="q"
          value={query}
          placeholder={t.hawala.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="hawala-status" className="font-semibold">
          {t.common.status}
        </Label>
        <select
          id="hawala-status"
          name="status"
          value={status}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          onChange={(event) => {
            const next = event.target.value as HawalaArchiveFilter;
            setStatus(next);
            router.push(buildHawalaHref(query, next));
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
