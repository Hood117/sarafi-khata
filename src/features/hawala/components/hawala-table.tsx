"use client";

import Link from "next/link";

import { ClickableTableRow } from "@/components/clickable-table-row";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import { HawalaEmptyState } from "@/features/hawala/components/hawala-empty-state";
import type { HawalaListItem } from "@/features/hawala/domain/types";

import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type HawalaArchiveFilter = "active" | "archived";

type HawalaTableProps = {
  transfers: HawalaListItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  archiveFilter?: HawalaArchiveFilter;
  hasSearch?: boolean;
  /** When set, detail links include returnTo for back navigation. */
  returnTo?: string;
};

function formatValueDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function buildHawalaHref(options: {
  search: string;
  archiveFilter: HawalaArchiveFilter;
  page: number;
}): string {
  const params = new URLSearchParams();
  const trimmed = options.search.trim();
  if (trimmed) {
    params.set("q", trimmed);
  }
  if (options.archiveFilter === "archived") {
    params.set("status", "archived");
  }
  if (options.page > 1) {
    params.set("page", String(options.page));
  }
  const query = params.toString();
  return query ? `/hawala?${query}` : "/hawala";
}

export function HawalaTable({
  transfers,
  total: totalProp,
  page = 1,
  pageSize = 25,
  search = "",
  archiveFilter = "active",
  hasSearch = false,
  returnTo,
}: HawalaTableProps) {
  const t = useT();
  const showing = transfers.length;
  const total = totalProp ?? showing;
  const paginated = totalProp != null;
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const hasPrevious = paginated && page > 1;
  const hasNext = paginated && page < totalPages;
  const previousHref = buildHawalaHref({
    search,
    archiveFilter,
    page: page - 1,
  });
  const nextHref = buildHawalaHref({
    search,
    archiveFilter,
    page: page + 1,
  });
  const listReturnTo =
    returnTo ?? buildHawalaHref({ search, archiveFilter, page });

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <HawalaEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.hawala.referenceNumber}</TableHead>
                <TableHead>{t.hawala.sender}</TableHead>
                <TableHead>{t.hawala.receiver}</TableHead>
                <TableHead>{t.hawala.partner}</TableHead>
                <TableHead>{t.hawala.origin}</TableHead>
                <TableHead>{t.hawala.destination}</TableHead>
                <TableHead>{t.common.currency}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.audit.actor}</TableHead>
                <TableHead className="w-[100px]">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const detailHref = hrefWithReturnTo(
                  `/hawala/${transfer.id}`,
                  listReturnTo,
                );

                return (
                  <ClickableTableRow key={transfer.id} href={detailHref}>
                    <TableCell className="font-mono text-sm">
                      {transfer.reference}
                    </TableCell>
                    <TableCell>{transfer.senderName}</TableCell>
                    <TableCell>{transfer.receiverName}</TableCell>
                    <TableCell>{transfer.partnerSarafi}</TableCell>
                    <TableCell>{transfer.originDisplay}</TableCell>
                    <TableCell>{transfer.destinationDisplay}</TableCell>
                    <TableCell>{transfer.currencyCode}</TableCell>
                    <TableCell className="tabular-nums">
                      {transfer.amountDisplay}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={transfer.statusLabel}
                        tone={toneForRecordStatus(transfer.status)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatValueDate(transfer.valueDate)}
                    </TableCell>
                    <TableCell>{displayValue(transfer.operatorName)}</TableCell>
                    <TableCell data-row-click-ignore>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={detailHref} />}
                      >
                        {t.common.view}
                      </Button>
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography variant="muted">
          {total === 0
            ? hasSearch
              ? t.hawala.emptyFiltered
              : t.hawala.emptyTitle
            : !paginated || showing === total
              ? `${t.common.showing} ${total}`
              : `${t.common.showing} ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + showing} ${t.common.of} ${total}`}
        </Typography>

        {paginated ? (
        <nav className="flex items-center gap-2" aria-label="Hawala pagination">
          {hasPrevious ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={previousHref} />}
              aria-label={t.common.previous}
            >
              {t.common.previous}
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {t.common.previous}
            </Button>
          )}
          {hasNext ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={nextHref} />}
              aria-label={t.common.next}
            >
              {t.common.next}
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {t.common.next}
            </Button>
          )}
        </nav>
        ) : null}
      </div>
    </div>
  );
}
