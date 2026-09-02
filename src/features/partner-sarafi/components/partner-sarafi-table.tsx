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
import { EditPartnerSarafiDialog } from "@/features/partner-sarafi/components/edit-partner-sarafi-dialog";
import type {
  PartnerCurrencyOption,
  PartnerCustomerOption,
} from "@/features/partner-sarafi/components/partner-sarafi-form";
import { PartnerSarafiEmptyState } from "@/features/partner-sarafi/components/partner-sarafi-empty-state";
import { SetPartnerSarafiActiveButton } from "@/features/partner-sarafi/components/set-partner-sarafi-active-button";
import type { PartnerSarafiListItem } from "@/features/partner-sarafi/domain/types";
import { useT } from "@/lib/i18n";

type PartnerSarafiTableProps = {
  partners: PartnerSarafiListItem[];
  customerOptions: PartnerCustomerOption[];
  currencyOptions: PartnerCurrencyOption[];
  onPartnerChanged?: (message: string) => void;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function PartnerSarafiTable({
  partners,
  customerOptions,
  currencyOptions,
  onPartnerChanged,
}: PartnerSarafiTableProps) {
  const t = useT();
  return (
    <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
      {partners.length === 0 ? (
        <PartnerSarafiEmptyState />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.common.name}</TableHead>
              <TableHead>{t.common.phone}</TableHead>
              <TableHead>{t.common.location}</TableHead>
              <TableHead>{t.partner.commission}</TableHead>
              <TableHead>{t.common.status}</TableHead>
              <TableHead className="w-[1%] whitespace-nowrap text-end">
                {t.common.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((partner) => {
              const location = [partner.city, partner.country]
                .filter(Boolean)
                .join(", ");
              const detailHref = `/partner-sarafi/${partner.id}`;

              return (
                <ClickableTableRow key={partner.id} href={detailHref}>
                  <TableCell className="font-semibold">
                    {partner.name}
                    {partner.needsCustomerLink ? (
                      <div className="text-muted-foreground text-xs font-normal">
                        {t.partner.needsCustomerLink}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{displayValue(partner.phone)}</TableCell>
                  <TableCell>{displayValue(location)}</TableCell>
                  <TableCell className="text-sm">
                    {partner.commissionRateLabel ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={
                        partner.isActive ? t.common.active : t.common.inactive
                      }
                      tone={toneForRecordStatus(
                        partner.isActive ? "ACTIVE" : "INACTIVE",
                      )}
                    />
                  </TableCell>
                  <TableCell data-row-click-ignore className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={detailHref} />}
                      >
                        {t.common.view}
                      </Button>
                      <EditPartnerSarafiDialog
                        partnerId={partner.id}
                        customerOptions={customerOptions}
                        currencyOptions={currencyOptions}
                        onSuccess={onPartnerChanged}
                      />
                      <SetPartnerSarafiActiveButton
                        partnerId={partner.id}
                        partnerName={partner.name}
                        isActive={partner.isActive}
                        onSuccess={onPartnerChanged}
                      />
                    </div>
                  </TableCell>
                </ClickableTableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
