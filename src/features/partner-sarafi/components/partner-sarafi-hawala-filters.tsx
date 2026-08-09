"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import type { HawalaDirection } from "@/features/hawala/domain/types";
import { useT } from "@/lib/i18n";

type PartnerSarafiHawalaFiltersProps = {
  partnerId: string;
  search: string;
  direction: HawalaDirection | "all";
};

function buildHref(
  partnerId: string,
  search: string,
  direction: HawalaDirection | "all",
): string {
  const params = new URLSearchParams();
  params.set("tab", "hawala");
  const trimmed = search.trim();
  if (trimmed) {
    params.set("q", trimmed);
  }
  if (direction !== "all") {
    params.set("direction", direction);
  }
  return `/partner-sarafi/${partnerId}?${params.toString()}`;
}

export function PartnerSarafiHawalaFilters({
  partnerId,
  search,
  direction,
}: PartnerSarafiHawalaFiltersProps) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [dir, setDir] = useState<HawalaDirection | "all">(direction);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref(partnerId, query, dir));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="partner-hawala-search" className="font-semibold">
          {t.hawala.searchPlaceholder}
        </Label>
        <SearchInput
          id="partner-hawala-search"
          name="q"
          value={query}
          placeholder={t.partner.hawalaSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-1.5 sm:w-48">
        <Label htmlFor="partner-hawala-direction" className="font-semibold">
          {t.hawala.direction}
        </Label>
        <select
          id="partner-hawala-direction"
          name="direction"
          value={dir}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          onChange={(event) => {
            const next = event.target.value as HawalaDirection | "all";
            setDir(next);
            router.push(buildHref(partnerId, query, next));
          }}
        >
          <option value="all">{t.common.all}</option>
          <option value="SEND">{t.partner.sentToPartner}</option>
          <option value="RECEIVE">{t.partner.receivedFromPartner}</option>
        </select>
      </div>

      <Button type="submit" className="sm:mb-0">
        {t.common.search}
      </Button>
    </form>
  );
}
