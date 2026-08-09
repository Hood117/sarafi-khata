"use client";

import { useEffect, useState } from "react";

import { HawalaFilters } from "@/features/hawala/components/hawala-filters";
import { HawalaPageHeader } from "@/features/hawala/components/hawala-page-header";
import { HawalaTable } from "@/features/hawala/components/hawala-table";
import type { HawalaListItem } from "@/features/hawala/domain/types";

type HawalaViewProps = {
  transfers: HawalaListItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  archiveFilter: "active" | "archived";
};

export function HawalaView({
  transfers,
  total,
  page,
  pageSize,
  search,
  archiveFilter,
}: HawalaViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  return (
    <div className="space-y-2">
      <HawalaPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
      />
      <HawalaFilters search={search} archiveFilter={archiveFilter} />
      <HawalaTable
        transfers={transfers}
        total={total}
        page={page}
        pageSize={pageSize}
        search={search}
        archiveFilter={archiveFilter}
        hasSearch={Boolean(search.trim())}
      />
    </div>
  );
}
