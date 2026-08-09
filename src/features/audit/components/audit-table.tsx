"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

import { ClickableTableRow } from "@/components/clickable-table-row";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import { AuditEmptyState } from "@/features/audit/components/audit-empty-state";
import {
  buildAuditHref,
  type AuditFilters,
} from "@/features/audit/domain/audit-filters";
import type { AuditLogListItem } from "@/features/audit/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type AuditTableProps = {
  items: AuditLogListItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditFilters;
  hasFilters?: boolean;
  /** When set, detail links include returnTo for back navigation. */
  returnTo?: string;
};

function formatTimestamp(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function AuditTable({
  items,
  total,
  page,
  pageSize,
  filters,
  hasFilters = false,
  returnTo,
}: AuditTableProps) {
  const t = useT();
  const showing = items.length;
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const previousHref = buildAuditHref({ ...filters, page: page - 1 });
  const nextHref = buildAuditHref({ ...filters, page: page + 1 });
  const listReturnTo = returnTo ?? buildAuditHref({ ...filters, page });

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <AuditEmptyState hasFilters={hasFilters} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const detailHref = hrefWithReturnTo(
                  `/audit/${item.id}`,
                  listReturnTo,
                );

                return (
                  <ClickableTableRow key={item.id} href={detailHref}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatTimestamp(item.createdAt)}
                    </TableCell>
                    <TableCell>{displayValue(item.userName)}</TableCell>
                    <TableCell>{item.moduleLabel}</TableCell>
                    <TableCell>{item.actionLabel}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {displayValue(item.entityLabel)}
                    </TableCell>
                    <TableCell className="max-w-[28rem]">
                      <span className="line-clamp-2">{item.summary}</span>
                    </TableCell>
                    <TableCell data-row-click-ignore>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={detailHref} />}
                      >
                        View
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
            ? hasFilters
              ? "No matching audit events"
              : "No audit events to display"
            : showing === total
              ? `Showing ${total} event${total === 1 ? "" : "s"}`
              : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + showing} of ${total} events`}
        </Typography>

        <nav className="flex items-center gap-2" aria-label="Audit log pagination">
          {hasPrevious ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={previousHref} />}
              aria-label={t.common.previous}
            >
              Previous
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              aria-label={t.common.previous}
            >
              Previous
            </Button>
          )}
          {hasNext ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={nextHref} />}
              aria-label={t.common.next}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              aria-label={t.common.next}
            >
              Next
            </Button>
          )}
        </nav>
      </div>
    </div>
  );
}
