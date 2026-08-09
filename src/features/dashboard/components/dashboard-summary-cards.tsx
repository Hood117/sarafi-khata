"use client";

import {
  ArrowLeftRight,
  Banknote,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Typography } from "@/design-system/typography";
import type {
  DashboardCustomerCounts,
  DashboardMonthCounts,
} from "@/features/dashboard/domain/types";
import { formatMessage, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DashboardSummaryCardsProps = {
  month: DashboardMonthCounts;
  customers: DashboardCustomerCounts;
  asOfMonth: string;
};

type SummaryCard = {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: string;
  glow: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function DashboardSummaryCards({
  month,
  customers,
  asOfMonth,
}: DashboardSummaryCardsProps) {
  const t = useT();
  const cards: SummaryCard[] = [
    {
      label: t.dashboard.thisMonthTransactions,
      value: month.transactions,
      hint: asOfMonth,
      icon: Banknote,
      tone: "from-[color-mix(in_oklab,var(--primary)_28%,transparent)] via-[color-mix(in_oklab,var(--primary)_8%,transparent)] to-transparent",
      glow: "bg-[color-mix(in_oklab,var(--primary)_22%,transparent)]",
    },
    {
      label: t.dashboard.thisMonthExchanges,
      value: month.exchanges,
      hint: t.dashboard.postedFxDeals,
      icon: ArrowLeftRight,
      tone: "from-[color-mix(in_oklab,var(--accent)_32%,transparent)] via-[color-mix(in_oklab,var(--accent)_10%,transparent)] to-transparent",
      glow: "bg-[color-mix(in_oklab,var(--accent)_24%,transparent)]",
    },
    {
      label: t.dashboard.thisMonthHawala,
      value: month.hawala,
      hint: t.dashboard.postedHawalaMovements,
      icon: Send,
      tone: "from-[color-mix(in_oklab,var(--primary-light)_30%,transparent)] via-[color-mix(in_oklab,var(--primary-light)_10%,transparent)] to-transparent",
      glow: "bg-[color-mix(in_oklab,var(--primary-light)_22%,transparent)]",
    },
    {
      label: t.dashboard.activeCustomers,
      value: customers.active,
      hint: formatMessage(t.dashboard.totalCount, {
        count: formatCount(customers.total),
      }),
      icon: Users,
      tone: "from-[color-mix(in_oklab,var(--accent)_24%,transparent)] via-transparent to-transparent",
      glow: "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
    },
  ];

  return (
    <section aria-label={t.dashboard.summary}>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className={cn(
                "group relative overflow-hidden rounded-3xl bg-card px-4 py-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)] ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]",
                "animate-in fade-in slide-in-from-bottom-2",
              )}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br",
                  card.tone,
                )}
                aria-hidden
              />
              <div
                className={cn(
                  "pointer-events-none absolute -top-8 -end-6 size-24 rounded-full blur-2xl",
                  card.glow,
                )}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Typography variant="overline" as="dt">
                    {card.label}
                  </Typography>
                  <Typography
                    variant="h2"
                    as="dd"
                    className="tabular-nums tracking-tight"
                  >
                    {formatCount(card.value)}
                  </Typography>
                  <Typography variant="caption" as="p">
                    {card.hint}
                  </Typography>
                </div>
                <span className="bg-background/80 text-primary inline-flex size-11 items-center justify-center rounded-2xl shadow-sm ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="size-5" aria-hidden />
                </span>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
