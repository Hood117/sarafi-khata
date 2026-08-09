"use client";

import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
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
import { ExchangeHistoryEmptyState } from "@/features/exchange/components/exchange-history-empty-state";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type ExchangeHistoryTableProps = {
  exchanges: ExchangeHistoryListItem[];
  hasSearch?: boolean;
  returnTo?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  previousHref?: string;
  nextHref?: string;
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

export function ExchangeHistoryTable({
  exchanges,
  hasSearch = false,
  returnTo = "/exchange",
  total,
  page = 1,
  pageSize = 25,
  previousHref,
  nextHref,
}: ExchangeHistoryTableProps) {
  const t = useT();
  const showing = exchanges.length;
  const resolvedTotal = total ?? showing;
  const paginated =
    previousHref != null && nextHref != null && total != null;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <ExchangeHistoryEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.reference}</TableHead>
                <TableHead>{t.wallets.customer}</TableHead>
                <TableHead>{t.exchange.fromCurrency}</TableHead>
                <TableHead>{t.exchange.toCurrency}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.exchange.exchangeRateUsed}</TableHead>
                <TableHead>{t.exchange.toAmount}</TableHead>
                <TableHead>{t.common.operator}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="w-[100px]">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchanges.map((exchange) => {
                const detailHref = hrefWithReturnTo(
                  `/exchange/${exchange.id}`,
                  returnTo,
                );

                return (
                  <ClickableTableRow key={exchange.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {exchange.reference}
                    </TableCell>
                    <TableCell>
                      {displayValue(exchange.customerName)}
                    </TableCell>
                    <TableCell>{exchange.fromCurrencyCode}</TableCell>
                    <TableCell>{exchange.toCurrencyCode}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {exchange.amountDisplay}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {exchange.exchangeRateDisplay}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {exchange.convertedAmountDisplay}
                    </TableCell>
                    <TableCell>
                      {displayValue(exchange.operatorName)}
                    </TableCell>
                    <TableCell>
                      {formatValueDate(exchange.valueDate)}
                    </TableCell>
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

      {paginated ? (
        <ListPagination
          total={resolvedTotal}
          page={page}
          pageSize={pageSize}
          showing={showing}
          previousHref={previousHref}
          nextHref={nextHref}
          emptyLabel={
            hasSearch ? t.exchange.emptyFiltered : t.common.noData
          }
          ariaLabel="Exchange pagination"
        />
      ) : (
        <div className="text-muted-foreground text-sm">
          {showing === 0
            ? hasSearch
              ? t.exchange.emptyFiltered
              : t.common.noData
            : `${t.common.showing} ${showing}`}
        </div>
      )}
    </div>
  );
}
