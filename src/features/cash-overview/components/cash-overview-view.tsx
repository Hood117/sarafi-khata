import { Typography } from "@/design-system/typography";
import type { BusinessCashBalance } from "@/features/wallets";

type CashOverviewViewProps = {
  balances: BusinessCashBalance[];
};

export function CashOverviewView({ balances }: CashOverviewViewProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Typography variant="h3" as="h2">
          Business Cash Overview
        </Typography>
        <Typography variant="muted">
          Available company cash by currency, calculated from vault and till
          ledger activity.
        </Typography>
      </div>

      <section
        className="bg-card ring-foreground/10 space-y-5 rounded-xl p-5 shadow-sm ring-1 sm:p-6"
        aria-labelledby="business-cash-heading"
      >
        <Typography
          variant="h4"
          id="business-cash-heading"
          className="font-bold"
        >
          Available Cash
        </Typography>

        {balances.length === 0 ? (
          <Typography variant="muted">
            No currencies are configured yet. Add currencies in Settings to
            track cash balances.
          </Typography>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((balance) => (
              <div
                key={balance.currencyCode}
                className="ring-foreground/10 space-y-1 rounded-xl px-4 py-4 ring-1"
              >
                <Typography variant="overline" as="dt">
                  {balance.currencyCode}
                </Typography>
                <Typography
                  variant="h2"
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
    </div>
  );
}
