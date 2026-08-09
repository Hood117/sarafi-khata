"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpFromLine,
  Send,
  type LucideIcon,
} from "lucide-react";

import { Typography } from "@/design-system/typography";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
};

export function DashboardQuickActions() {
  const t = useT();

  const actions: QuickAction[] = [
    {
      href: "/transactions",
      label: t.dashboard.newDeposit,
      description: t.transactions.deposit,
      icon: ArrowDownToLine,
      tone: "bg-primary/10 text-primary",
    },
    {
      href: "/transactions",
      label: t.dashboard.newWithdrawal,
      description: t.transactions.withdrawal,
      icon: ArrowUpFromLine,
      tone: "bg-accent/20 text-accent-foreground",
    },
    {
      href: "/exchange",
      label: t.dashboard.newExchange,
      description: t.exchange.newExchange,
      icon: ArrowLeftRight,
      tone: "bg-primary-light/15 text-primary-dark",
    },
    {
      href: "/hawala",
      label: t.dashboard.newHawala,
      description: t.dashboard.sendHawala,
      icon: Send,
      tone: "bg-primary/10 text-primary",
    },
    {
      href: "/transfers",
      label: t.dashboard.newTransfer,
      description: t.transfers.newTransfer,
      icon: ArrowRightLeft,
      tone: "bg-accent/20 text-accent-foreground",
    },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
      aria-labelledby="dashboard-actions-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
        aria-hidden
      />
      <div className="relative space-y-3">
        <div className="space-y-1">
          <Typography
            variant="h4"
            id="dashboard-actions-heading"
            className="font-bold"
          >
            {t.dashboard.quickActions}
          </Typography>
          <Typography variant="muted">{t.dashboard.overview}</Typography>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <li key={action.href + action.label}>
                <Link
                  href={action.href}
                  className={cn(
                    "group focus-visible:ring-ring flex items-start gap-3 rounded-xl px-3 py-3 ring-1 ring-foreground/10 transition-all outline-none",
                    "hover:bg-muted/50 hover:ring-primary/20 focus-visible:ring-3",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105",
                      action.tone,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <Typography
                      variant="bodySm"
                      className="font-semibold tracking-tight"
                    >
                      {action.label}
                    </Typography>
                    <Typography variant="caption" as="p">
                      {action.description}
                    </Typography>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
