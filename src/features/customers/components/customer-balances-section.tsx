import { Typography } from "@/design-system/typography";
import type { CustomerCurrencyBalance } from "@/features/wallets";

type CustomerBalancesSectionProps = {
  balances: CustomerCurrencyBalance[];
};

export function CustomerBalancesSection({
  balances,
}: CustomerBalancesSectionProps) {
  return (
    <section
      className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1"
      aria-labelledby="customer-balances-heading"
    >
      <Typography variant="h4" id="customer-balances-heading" className="font-bold">
        Current Balances
      </Typography>

      {balances.length === 0 ? (
        <Typography variant="muted">
          No currencies are configured yet. Add currencies in Settings to track
          balances.
        </Typography>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((balance) => (
            <div
              key={balance.currencyCode}
              className="bg-card ring-foreground/10 space-y-1 rounded-xl px-3 py-2 ring-1"
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
