"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import type { BusinessCashBalance } from "@/features/wallets";
import { useT } from "@/lib/i18n";

type DashboardBusinessCashProps = {
  balances: BusinessCashBalance[];
};

export function DashboardBusinessCash({ balances }: DashboardBusinessCashProps) {
  const t = useT();

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
      aria-labelledby="dashboard-cash-heading"
    >
      <div
        className="pointer-events-none absolute -top-16 -end-10 size-40 rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] blur-2xl"
        aria-hidden
      />
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Typography
              variant="h4"
              id="dashboard-cash-heading"
              className="font-bold"
            >
              {t.dashboard.businessCash}
            </Typography>
            <Typography variant="muted">
              {t.dashboard.businessCashHint}
            </Typography>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/cash" />}>
            {t.dashboard.viewCash}
          </Button>
        </div>

        {balances.length === 0 ? (
          <Typography variant="muted">
            {t.dashboard.noCurrenciesConfigured}
          </Typography>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {balances.map((balance) => (
              <div
                key={balance.currencyCode}
                className="rounded-xl bg-[linear-gradient(160deg,color-mix(in_oklab,var(--primary)_8%,transparent),transparent)] px-3 py-3 ring-1 ring-foreground/10"
              >
                <Typography variant="overline" as="dt">
                  {balance.currencyCode}
                </Typography>
                <Typography
                  variant="h3"
                  as="dd"
                  className="mt-1 tabular-nums tracking-tight"
                >
                  {balance.balanceDisplay}
                </Typography>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
