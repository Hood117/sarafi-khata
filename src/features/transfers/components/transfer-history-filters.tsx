"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
          {t.common.search}
        </Label>
        <SearchInput
          id="transfer-history-search"
          name="q"
          value={query}
          placeholder={t.transfers.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Button type="submit" variant="outline" className="h-10">
        {t.common.search}
      </Button>
    </form>
  );
}
