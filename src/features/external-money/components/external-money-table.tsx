"use client";

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
import { ArchiveExternalMoneyButton } from "@/features/external-money/components/archive-external-money-button";
import { EditExternalMoneyDialog } from "@/features/external-money/components/edit-external-money-dialog";
import { ExternalMoneyEmptyState } from "@/features/external-money/components/external-money-empty-state";
import type {
  ExternalMoneyArchiveFilter,
  ExternalMoneyListItem,
} from "@/features/external-money/domain/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type ExternalMoneyTableProps = {
  items: ExternalMoneyListItem[];
  archiveFilter: ExternalMoneyArchiveFilter;
  hasFilters: boolean;
  onUpdated?: (message: string) => void;
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

const actionButtonClass =
  "h-8 shrink-0 whitespace-nowrap px-2.5 text-xs font-semibold";

export function ExternalMoneyTable({
  items,
  archiveFilter,
  hasFilters,
  onUpdated,
}: ExternalMoneyTableProps) {
  const t = useT();
  const total = items.length;

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <ExternalMoneyEmptyState
            hasFilters={hasFilters}
            viewingArchived={archiveFilter === "archived"}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.reference}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.externalMoney.cashWallet}</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-[1%] whitespace-nowrap text-end">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm font-semibold">
                    {item.reference}
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {item.amountFormatted}
                  </TableCell>
                  <TableCell>{item.cashWalletName}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">
                    {displayValue(item.notes)}
                  </TableCell>
                  <TableCell>{formatValueDate(item.valueDate)}</TableCell>
                  <TableCell>{displayValue(item.operatorName)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={item.isArchived ? "Archived" : "Active"}
                      tone={toneForRecordStatus(
                        item.isArchived ? "ARCHIVED" : "ACTIVE",
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      {item.isArchived ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <>
                          <EditExternalMoneyDialog
                            item={item}
                            onSuccess={onUpdated}
                            triggerClassName={cn(
                              actionButtonClass,
                              "bg-primary-dark/10 text-primary-dark hover:bg-primary-dark/18 hover:text-primary-dark",
                            )}
                          />
                          <ArchiveExternalMoneyButton
                            transactionId={item.id}
                            reference={item.reference}
                            onSuccess={onUpdated}
                            triggerClassName={cn(
                              actionButtonClass,
                              "bg-destructive/10 text-destructive hover:bg-destructive/18 hover:text-destructive",
                            )}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Typography variant="muted">
        {total === 0
          ? "No entries to display"
          : `Showing ${total} entr${total === 1 ? "y" : "ies"}`}
      </Typography>
    </div>
  );
}
