"use client";

import Link from "next/link";

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
import { SettlePartnerCommissionDialog } from "@/features/partner-sarafi/components/settle-partner-commission-dialog";
import type { PartnerCommissionSummary } from "@/features/partner-sarafi/domain/types";
import { useT } from "@/lib/i18n";
import { hrefWithReturnTo } from "@/lib/navigation";

type PartnerSarafiCommissionSectionProps = {
  summary: PartnerCommissionSummary;
  cashWallets: Array<{ id: string; label: string }>;
  returnTo: string;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function hasOpenBalance(value: string): boolean {
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0;
}

export function PartnerSarafiCommissionSection({
  summary,
  cashWallets,
  returnTo,
}: PartnerSarafiCommissionSectionProps) {
  const t = useT();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Typography variant="h4">{t.partner.commissionByCurrency}</Typography>
      </div>

      {summary.balances.length === 0 ? (
        <div className="bg-card rounded-2xl px-4 py-10 text-center shadow-sm ring-1 ring-foreground/8">
          <Typography variant="muted">{t.partner.noCommissionYet}</Typography>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.balances.map((balance) => (
            <div
              key={balance.currencyId}
              className="from-card to-surface relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 shadow-sm ring-1 ring-foreground/8"
            >
              <div className="relative space-y-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Typography variant="overline">{t.common.currency}</Typography>
                  <Typography variant="h3">{balance.currencyCode}</Typography>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="bg-background/70 rounded-xl px-3 py-2.5 ring-1 ring-foreground/5">
                    <dt className="text-muted-foreground text-xs">
                      {t.partner.accruedPayable}
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {balance.payableAccrued} {balance.currencyCode}
                    </dd>
                  </div>
                  <div className="bg-background/70 rounded-xl px-3 py-2.5 ring-1 ring-foreground/5">
                    <dt className="text-muted-foreground text-xs">
                      {t.partner.accruedReceivable}
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {balance.receivableAccrued} {balance.currencyCode}
                    </dd>
                  </div>
                  <div className="bg-background/70 rounded-xl px-3 py-2.5 ring-1 ring-foreground/5">
                    <dt className="text-muted-foreground text-xs">
                      {t.partner.paidToHim}
                    </dt>
                    <dd className="mt-1 tabular-nums">
                      {balance.paid} {balance.currencyCode}
                    </dd>
                  </div>
                  <div className="bg-background/70 rounded-xl px-3 py-2.5 ring-1 ring-foreground/5">
                    <dt className="text-muted-foreground text-xs">
                      {t.partner.collectedFromHim}
                    </dt>
                    <dd className="mt-1 tabular-nums">
                      {balance.collected} {balance.currencyCode}
                    </dd>
                  </div>
                </dl>

                <div className="border-border/60 space-y-2 border-t pt-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {t.partner.youOwe}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {balance.youOwe} {balance.currencyCode}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {t.partner.theyOwe}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {balance.theyOweYou} {balance.currencyCode}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {hasOpenBalance(balance.youOweRaw) ? (
                    <SettlePartnerCommissionDialog
                      partnerId={summary.partnerId}
                      partnerName={summary.partnerName}
                      kind="PAY_PARTNER"
                      currencyCode={balance.currencyCode}
                      maxAmount={balance.youOweRaw}
                      cashWallets={cashWallets}
                      triggerLabel={t.partner.payHim}
                    />
                  ) : null}
                  {hasOpenBalance(balance.theyOweYouRaw) ? (
                    <SettlePartnerCommissionDialog
                      partnerId={summary.partnerId}
                      partnerName={summary.partnerName}
                      kind="COLLECT_FROM_PARTNER"
                      currencyCode={balance.currencyCode}
                      maxAmount={balance.theyOweYouRaw}
                      cashWallets={cashWallets}
                      triggerLabel={t.partner.collectFromHim}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Typography variant="h4">{t.partner.commissionOnHawala}</Typography>
        <div className="bg-card overflow-x-auto rounded-2xl shadow-sm ring-1 ring-foreground/8">
          {summary.hawalaCommissionRows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Typography variant="muted">{t.partner.noCommissionYet}</Typography>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.common.date}</TableHead>
                  <TableHead>{t.partner.hawalaTab}</TableHead>
                  <TableHead>{t.common.reference}</TableHead>
                  <TableHead>{t.common.amount}</TableHead>
                  <TableHead>{t.partner.commission}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead className="w-[90px]">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.hawalaCommissionRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.valueDate)}</TableCell>
                    <TableCell>{row.directionLabel}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.reference}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.hawalaAmountDisplay} {row.currencyCode}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {row.commissionAmountDisplay} {row.currencyCode}
                    </TableCell>
                    <TableCell>{row.commissionSideLabel ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            href={hrefWithReturnTo(
                              `/hawala/${row.id}`,
                              returnTo,
                            )}
                          />
                        }
                      >
                        {t.common.view}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Typography variant="h4">{t.partner.settlements}</Typography>
        <div className="bg-card overflow-x-auto rounded-2xl shadow-sm ring-1 ring-foreground/8">
          {summary.settlements.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Typography variant="muted">{t.partner.settlements}</Typography>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.common.date}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead>{t.common.amount}</TableHead>
                  <TableHead>{t.common.name}</TableHead>
                  <TableHead>{t.common.notes}</TableHead>
                  <TableHead className="w-[90px]">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.settlements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.valueDate)}</TableCell>
                    <TableCell>{row.kindLabel}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {row.amountDisplay} {row.currencyCode}
                    </TableCell>
                    <TableCell>{row.operatorName ?? "—"}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">
                      {row.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            href={hrefWithReturnTo(
                              `/transactions/${row.transactionId}`,
                              returnTo,
                            )}
                          />
                        }
                      >
                        {t.common.view}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
