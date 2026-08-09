"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { useT } from "@/lib/i18n";

type ExchangeHistoryFiltersProps = {
  search: string;
};

function buildExchangeHref(search: string): string {
  const params = new URLSearchParams();
  const trimmed = search.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  const query = params.toString();
  return query ? `/exchange?${query}` : "/exchange";
}

export function ExchangeHistoryFilters({
  search,
}: ExchangeHistoryFiltersProps) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(search);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildExchangeHref(query));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="exchange-history-search" className="font-semibold">
          {t.common.search}
        </Label>
        <SearchInput
          id="exchange-history-search"
          name="q"
          value={query}
          placeholder={t.exchange.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Button type="submit" variant="outline" className="h-10">
        {t.common.search}
      </Button>
    </form>
  );
}
