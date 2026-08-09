"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import type { ExternalMoneyArchiveFilter } from "@/features/external-money/domain/types";
import { useT } from "@/lib/i18n";

type ExternalMoneyFiltersProps = {
  search: string;
  archiveFilter: ExternalMoneyArchiveFilter;
};

function buildExternalMoneyHref(
  search: string,
  archiveFilter: ExternalMoneyArchiveFilter,
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
  return query ? `/external-money?${query}` : "/external-money";
}

export function ExternalMoneyFilters({
  search,
  archiveFilter,
}: ExternalMoneyFiltersProps) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState<ExternalMoneyArchiveFilter>(archiveFilter);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef(query);
  const statusRef = useRef(status);

  latestQueryRef.current = query;
  statusRef.current = status;

  useEffect(() => {
    setQuery(search);
  }, [search]);

  useEffect(() => {
    setStatus(archiveFilter);
  }, [archiveFilter]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function applyFilters(
    nextSearch: string,
    nextArchiveFilter: ExternalMoneyArchiveFilter,
  ) {
    router.push(buildExternalMoneyHref(nextSearch, nextArchiveFilter));
  }

  function scheduleSearch(nextQuery: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      applyFilters(nextQuery, statusRef.current);
    }, 200);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="external-money-search" className="font-semibold">
          {t.common.search}
        </Label>
        <SearchInput
          id="external-money-search"
          name="q"
          value={query}
          placeholder={t.common.search}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            scheduleSearch(nextQuery);
          }}
        />
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="external-money-status" className="font-semibold">
          Status
        </Label>
        <select
          id="external-money-status"
          name="status"
          value={status}
          className="border-input bg-background focus-visible:border-primary-light focus-visible:ring-primary-light/40 h-10 w-full rounded-lg border px-2.5 text-sm shadow-sm outline-none focus-visible:ring-3"
          onChange={(event) => {
            const nextStatus = event.target.value as ExternalMoneyArchiveFilter;
            setStatus(nextStatus);
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
            }
            applyFilters(latestQueryRef.current, nextStatus);
          }}
        >
          <option value="active">{t.common.active}</option>
          <option value="archived">{t.common.archived}</option>
        </select>
      </div>
    </div>
  );
}
