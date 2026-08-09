"use client";

import { Banknote } from "lucide-react";

import { Typography } from "@/design-system/typography";
import {
  formatCurrencyLabel,
  formatMoneyWithCurrency,
} from "@/features/transactions/domain/currency-display";
import type { BusinessCashBalance } from "@/features/wallets";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type CashOverviewViewProps = {
  balances: BusinessCashBalance[];
};

const CARD_TONES = [
  {
    panel:
      "from-[color-mix(in_oklab,var(--primary)_24%,transparent)] via-transparent to-transparent",
    glow: "bg-[color-mix(in_oklab,var(--primary)_28%,transparent)]",
    icon: "bg-primary/12 text-primary ring-primary/20",
    edge: "from-primary/80 to-transparent",
  },
  {
    panel:
      "from-[color-mix(in_oklab,var(--accent)_28%,transparent)] via-transparent to-transparent",
    glow: "bg-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    icon: "bg-amber-500/15 text-amber-800 ring-amber-500/25",
    edge: "from-amber-500/80 to-transparent",
  },
  {
    panel:
      "from-[color-mix(in_oklab,#0d9488_20%,transparent)] via-transparent to-transparent",
    glow: "bg-[color-mix(in_oklab,#0d9488_26%,transparent)]",
    icon: "bg-teal-500/15 text-teal-700 ring-teal-500/25",
    edge: "from-teal-500/80 to-transparent",
  },
  {
    panel:
      "from-[color-mix(in_oklab,#7c3aed_18%,transparent)] via-transparent to-transparent",
    glow: "bg-[color-mix(in_oklab,#7c3aed_24%,transparent)]",
    icon: "bg-violet-500/15 text-violet-700 ring-violet-500/25",
    edge: "from-violet-500/80 to-transparent",
  },
] as const;

export function CashOverviewView({ balances }: CashOverviewViewProps) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Typography variant="h3" as="h2">
          {t.cash.overview}
        </Typography>
        <Typography variant="muted">
          {t.dashboard.businessCashHint}
        </Typography>
      </div>

      <section aria-labelledby="business-cash-heading" className="space-y-3">
        <Typography
          variant="h4"
          id="business-cash-heading"
          className="font-bold"
        >
          {t.cash.available}
        </Typography>

        {balances.length === 0 ? (
          <div className="bg-muted/40 rounded-3xl px-4 py-8 text-center ring-1 ring-foreground/10">
            <Typography variant="muted">{t.cash.noCashYet}</Typography>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {balances.map((balance, index) => {
              const tone = CARD_TONES[index % CARD_TONES.length]!;
              const label = formatCurrencyLabel({
                code: balance.currencyCode,
                symbol: balance.currencySymbol,
                locale,
              });
              const amount = formatMoneyWithCurrency({
                code: balance.currencyCode,
                symbol: balance.currencySymbol,
                amountDisplay: balance.balanceDisplay,
                locale,
              });

              return (
                <div
                  key={balance.currencyCode}
                  className={cn(
                    "group relative overflow-hidden rounded-3xl bg-card px-4 py-5 shadow-[0_14px_36px_-20px_rgba(0,0,0,0.45)] ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_-22px_rgba(0,0,0,0.55)]",
                    "animate-in fade-in slide-in-from-bottom-2",
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 bg-gradient-to-br",
                      tone.panel,
                    )}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      "pointer-events-none absolute -top-10 -right-8 size-28 rounded-full blur-2xl",
                      tone.glow,
                    )}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b",
                      tone.edge,
                    )}
                    aria-hidden
                  />
                  <div className="relative flex items-start justify-between gap-3 pl-2">
                    <div className="min-w-0 space-y-2">
                      <Typography variant="overline" as="dt">
                        {label}
                      </Typography>
                      <Typography
                        variant="h2"
                        as="dd"
                        className="tabular-nums tracking-tight"
                      >
                        {amount}
                      </Typography>
                      <Typography variant="caption" as="p">
                        Vault + till available
                      </Typography>
                    </div>
                    <span
                      className={cn(
                        "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-110",
                        tone.icon,
                      )}
                    >
                      <Banknote className="size-5" aria-hidden />
                    </span>
                  </div>
                </div>
              );
            })}
          </dl>
        )}
      </section>
    </div>
  );
}
