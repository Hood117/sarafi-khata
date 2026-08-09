"use client";

import type { TransactionStatus } from "@/generated/prisma/client";
import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
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
import { TransferHistoryEmptyState } from "@/features/transfers/components/transfer-history-empty-state";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { useT } from "@/lib/i18n";

type TransferHistoryTableProps = {
  transfers: TransferHistoryListItem[];
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

function TransferStatusBadge({
  status,
  label,
}: {
  status: TransactionStatus;
  label: string;
}) {
  return (
    <StatusBadge label={label} tone={toneForRecordStatus(status)} />
  );
}

export function TransferHistoryTable({
  transfers,
  hasSearch = false,
  returnTo = "/transfers",
  total,
  page = 1,
  pageSize = 25,
  previousHref,
  nextHref,
}: TransferHistoryTableProps) {
  const t = useT();
  const showing = transfers.length;
  const resolvedTotal = total ?? showing;
  const paginated =
    previousHref != null && nextHref != null && total != null;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {showing === 0 ? (
          <TransferHistoryEmptyState hasSearch={hasSearch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.reference}</TableHead>
                <TableHead>{t.transfers.fromCustomer}</TableHead>
                <TableHead>{t.transfers.toCustomer}</TableHead>
                <TableHead>{t.common.currency}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.common.operator}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-[100px]">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const detailHref = hrefWithReturnTo(
                  `/transfers/${transfer.id}`,
                  returnTo,
                );

                return (
                  <ClickableTableRow key={transfer.id} href={detailHref}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {transfer.reference}
                    </TableCell>
                    <TableCell>{displayValue(transfer.senderName)}</TableCell>
                    <TableCell>
                      {displayValue(transfer.receiverName)}
                    </TableCell>
                    <TableCell>{transfer.currencyCode}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {transfer.amountDisplay}
                    </TableCell>
                    <TableCell>
                      {displayValue(transfer.operatorName)}
                    </TableCell>
                    <TableCell>
                      {formatValueDate(transfer.valueDate)}
                    </TableCell>
                    <TableCell>
                      <TransferStatusBadge
                        status={transfer.status}
                        label={transfer.statusLabel}
                      />
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
            hasSearch ? t.transfers.emptyFiltered : t.common.noData
          }
          ariaLabel="Transfer pagination"
        />
      ) : (
        <div className="text-muted-foreground text-sm">
          {showing === 0
            ? hasSearch
              ? t.transfers.emptyFiltered
              : t.common.noData
            : `${t.common.showing} ${showing}`}
        </div>
      )}
    </div>
  );
}
