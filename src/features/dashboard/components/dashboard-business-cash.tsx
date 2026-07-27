import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import type { BusinessCashBalance } from "@/features/wallets";

type DashboardBusinessCashProps = {
  balances: BusinessCashBalance[];
};

export function DashboardBusinessCash({ balances }: DashboardBusinessCashProps) {
  return (
    <section
      className="bg-card ring-foreground/10 space-y-5 rounded-xl p-5 shadow-sm ring-1 sm:p-6"
      aria-labelledby="dashboard-cash-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Typography
            variant="h4"
            id="dashboard-cash-heading"
            className="font-bold"
          >
            Business Cash
          </Typography>
          <Typography variant="muted">
            Available company cash by currency from vault and till.
          </Typography>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/cash" />}
        >
          View cash
        </Button>
      </div>

      {balances.length === 0 ? (
        <Typography variant="muted">
          No currencies are configured yet. Add currencies in Settings to track
          cash balances.
        </Typography>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {balances.map((balance) => (
            <div
              key={balance.currencyCode}
              className="ring-foreground/10 space-y-1 rounded-xl px-4 py-4 ring-1"
            >
              <Typography variant="overline" as="dt">
                {balance.currencyCode}
              </Typography>
              <Typography
                variant="h3"
                as="dd"
                className="tabular-nums tracking-tight"
              >
                {balance.balanceDisplay}
              </Typography>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
