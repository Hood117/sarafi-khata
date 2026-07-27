"use client";

import Link from "next/link";

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
import { ExchangeHistoryEmptyState } from "@/features/exchange/components/exchange-history-empty-state";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";

type ExchangeHistoryTableProps = {
  exchanges: ExchangeHistoryListItem[];
  hasSearch?: boolean;
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

export function ExchangeHistoryTable({
  exchanges,
  hasSearch = false,
  returnTo = "/exchange",
}: ExchangeHistoryTableProps) {
  const total = exchanges.length;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <ExchangeHistoryEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>From Currency</TableHead>
                <TableHead>To Currency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Exchange Rate Used</TableHead>
                <TableHead>Converted Amount</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
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
            ? hasSearch
              ? "No matching exchanges"
              : "No exchanges to display"
            : `Showing ${total} exchange${total === 1 ? "" : "s"}`}
        </Typography>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
