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
import type {
  HawalaDirection,
  HawalaListItem,
} from "@/features/hawala/domain/types";
import { PartnerSarafiHawalaFilters } from "@/features/partner-sarafi/components/partner-sarafi-hawala-filters";
import { useT } from "@/lib/i18n";
import { hrefWithReturnTo } from "@/lib/navigation";

type PartnerSarafiHawalaSectionProps = {
  partnerId: string;
  transfers: HawalaListItem[];
  search: string;
  direction: HawalaDirection | "all";
  returnTo: string;
};

function formatValueDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

export function PartnerSarafiHawalaSection({
  partnerId,
  transfers,
  search,
  direction,
  returnTo,
}: PartnerSarafiHawalaSectionProps) {
  const t = useT();
  const hasFilters = Boolean(search.trim()) || direction !== "all";

  function directionLabel(dir: HawalaListItem["direction"]): string {
    return dir === "SEND" ? t.partner.sentToPartner : t.partner.receivedFromPartner;
  }

  return (
    <div className="space-y-3">
      <PartnerSarafiHawalaFilters
        partnerId={partnerId}
        search={search}
        direction={direction}
      />

      <div className="bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ring-foreground/10">
        {transfers.length === 0 ? (
          <div className="space-y-2 px-6 py-12 text-center">
            <Typography variant="h4">{t.partner.noHawalaYet}</Typography>
            <Typography variant="muted">
              {hasFilters ? t.common.noResults : t.hawala.emptyHint}
            </Typography>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.hawala.direction}</TableHead>
                <TableHead>{t.common.reference}</TableHead>
                <TableHead>{t.hawala.sender}</TableHead>
                <TableHead>{t.hawala.receiver}</TableHead>
                <TableHead>{t.common.currency}</TableHead>
                <TableHead>{t.common.amount}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="w-[100px]">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const detailHref = hrefWithReturnTo(
                  `/hawala/${transfer.id}`,
                  returnTo,
                );

                return (
                  <ClickableTableRow key={transfer.id} href={detailHref}>
                    <TableCell className="font-medium">
                      {directionLabel(transfer.direction)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {transfer.reference}
                    </TableCell>
                    <TableCell>{transfer.senderName}</TableCell>
                    <TableCell>{transfer.receiverName}</TableCell>
                    <TableCell>{transfer.currencyCode}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {transfer.amountDisplay}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={transfer.statusLabel}
                        tone={toneForRecordStatus(transfer.status)}
                      />
                    </TableCell>
                    <TableCell>{formatValueDate(transfer.valueDate)}</TableCell>
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

      {transfers.length > 0 ? (
        <Typography variant="muted" className="text-sm">
          {t.common.showing} {transfers.length}
        </Typography>
      ) : null}
    </div>
  );
}
