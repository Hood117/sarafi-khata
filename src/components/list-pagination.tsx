"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";

type ListPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  showing: number;
  previousHref: string;
  nextHref: string;
  emptyLabel: string;
  ariaLabel: string;
};

export function ListPagination({
  total,
  page,
  pageSize,
  showing,
  previousHref,
  nextHref,
  emptyLabel,
  ariaLabel,
}: ListPaginationProps) {
  const t = useT();
  const hasPrevious = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Typography variant="muted">
        {total === 0
          ? emptyLabel
          : showing === total
            ? `${t.common.showing} ${total}`
            : `${t.common.showing} ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + showing} ${t.common.of} ${total}`}
      </Typography>

      <nav className="flex items-center gap-2" aria-label={ariaLabel}>
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
    </div>
  );
}
