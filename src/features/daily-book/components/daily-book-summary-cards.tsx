import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Coins,
  HandCoins,
  Send,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Typography } from "@/design-system/typography";
import type { DailyBookSummary } from "@/features/daily-book/domain/daily-book-summary";
import { cn } from "@/lib/utils";

type DailyBookSummaryCardsProps = {
  summary: DailyBookSummary;
  dateLabel: string;
  currencyFilterLabel?: string | null;
};

type CardTone = {
  panel: string;
  glow: string;
  icon: string;
  edge: string;
};

function iconForType(label: string): LucideIcon {
  switch (label) {
    case "Sent Hawala":
      return ArrowUpRight;
    case "Received Hawala":
      return ArrowDownLeft;
    case "Hawala":
      return Send;
    case "Exchange":
      return ArrowLeftRight;
    case "Transfer":
      return ArrowRightLeft;
    case "Deposit":
    case "Withdrawal":
      return Banknote;
    case "Added to wallet":
      return Wallet;
    case "External money":
      return HandCoins;
    default:
      return Coins;
  }
}

function toneForType(label: string): CardTone {
  switch (label) {
    case "Sent Hawala":
      return {
        panel:
          "from-[color-mix(in_oklab,#e11d48_18%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,#e11d48_28%,transparent)]",
        icon: "bg-rose-500/15 text-rose-700 ring-rose-500/25",
        edge: "from-rose-500/70 to-transparent",
      };
    case "Received Hawala":
      return {
        panel:
          "from-[color-mix(in_oklab,#0d9488_18%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,#0d9488_28%,transparent)]",
        icon: "bg-teal-500/15 text-teal-700 ring-teal-500/25",
        edge: "from-teal-500/70 to-transparent",
      };
    case "Exchange":
      return {
        panel:
          "from-[color-mix(in_oklab,var(--accent)_24%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
        icon: "bg-amber-500/15 text-amber-800 ring-amber-500/25",
        edge: "from-amber-500/70 to-transparent",
      };
    case "Transfer":
      return {
        panel:
          "from-[color-mix(in_oklab,#7c3aed_18%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,#7c3aed_26%,transparent)]",
        icon: "bg-violet-500/15 text-violet-700 ring-violet-500/25",
        edge: "from-violet-500/70 to-transparent",
      };
    case "Added to wallet":
      return {
        panel:
          "from-[color-mix(in_oklab,#059669_18%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,#059669_26%,transparent)]",
        icon: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25",
        edge: "from-emerald-500/70 to-transparent",
      };
    case "External money":
      return {
        panel:
          "from-[color-mix(in_oklab,var(--primary)_22%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,var(--primary)_28%,transparent)]",
        icon: "bg-primary/12 text-primary ring-primary/25",
        edge: "from-primary/70 to-transparent",
      };
    default:
      return {
        panel:
          "from-[color-mix(in_oklab,var(--primary)_20%,transparent)] via-transparent to-transparent",
        glow: "bg-[color-mix(in_oklab,var(--primary)_24%,transparent)]",
        icon: "bg-primary/10 text-primary ring-primary/20",
        edge: "from-primary/70 to-transparent",
      };
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function DailyBookSummaryCards({
  summary,
  dateLabel,
  currencyFilterLabel,
}: DailyBookSummaryCardsProps) {
  return (
    <section aria-label="Daily book summary" className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="group relative overflow-hidden rounded-3xl bg-card px-4 py-5 shadow-[0_14px_36px_-20px_rgba(0,0,0,0.5)] ring-1 ring-foreground/10 sm:col-span-2 xl:col-span-1">
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_55%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-[color-mix(in_oklab,var(--accent)_28%,transparent)] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary via-accent to-transparent"
            aria-hidden
          />
          <div className="relative space-y-3 pl-2">
            <div className="space-y-1">
              <Typography variant="overline" as="dt">
                Day totals
              </Typography>
              <Typography
                variant="h2"
                as="dd"
                className="tabular-nums tracking-tight"
              >
                {formatCount(summary.totalCount)}
              </Typography>
              <Typography variant="caption" as="p">
                {dateLabel}
                {currencyFilterLabel ? ` · ${currencyFilterLabel}` : ""}
              </Typography>
            </div>
            {summary.grandTotals.length > 0 ? (
              <ul className="space-y-1.5">
                {summary.grandTotals.map((total) => (
                  <li
                    key={total.currencyCode}
                    className="bg-background/70 inline-flex rounded-xl px-2.5 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-foreground/10"
                  >
                    {total.amountFormatted}
                  </li>
                ))}
              </ul>
            ) : (
              <Typography variant="muted" as="p">
                No posted money for this day.
              </Typography>
            )}
          </div>
        </div>

        {summary.operations.map((card, index) => {
          const Icon = iconForType(card.label);
          const tone = toneForType(card.label);
          return (
            <div
              key={card.key}
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
                    {card.label}
                  </Typography>
                  <Typography variant="caption" as="p">
                    {formatCount(card.count)} movement
                    {card.count === 1 ? "" : "s"}
                  </Typography>
                  {card.totals.length > 0 ? (
                    <ul className="space-y-1.5" role="dd">
                      {card.totals.map((total) => (
                        <li
                          key={`${card.key}-${total.currencyCode}`}
                          className="text-base font-semibold tabular-nums tracking-tight"
                        >
                          {total.amountFormatted}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Typography variant="muted" as="p">
                      No amount
                    </Typography>
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-110",
                    tone.icon,
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
              </div>
            </div>
          );
        })}
      </dl>

      {summary.operations.length === 0 ? (
        <div className="bg-muted/40 rounded-3xl px-4 py-8 text-center ring-1 ring-foreground/10">
          <Typography variant="muted">
            No operations for this day
            {currencyFilterLabel ? ` in ${currencyFilterLabel}` : ""}.
          </Typography>
        </div>
      ) : null}
    </section>
  );
}
