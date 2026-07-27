import { Typography } from "@/design-system/typography";
import type { DashboardCustomerCounts, DashboardTodayCounts } from "@/features/dashboard/domain/types";

type DashboardSummaryCardsProps = {
  today: DashboardTodayCounts;
  customers: DashboardCustomerCounts;
  asOfDate: string;
};

type SummaryCard = {
  label: string;
  value: number;
  hint: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatAsOfDate(dateOnly: string): string {
  const parsed = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateOnly;
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function DashboardSummaryCards({
  today,
  customers,
  asOfDate,
}: DashboardSummaryCardsProps) {
  const cards: SummaryCard[] = [
    {
      label: "Today's Transactions",
      value: today.transactions,
      hint: formatAsOfDate(asOfDate),
    },
    {
      label: "Today's Exchanges",
      value: today.exchanges,
      hint: "Posted FX deals",
    },
    {
      label: "Today's Hawala",
      value: today.hawala,
      hint: "Posted hawala movements",
    },
    {
      label: "Active Customers",
      value: customers.active,
      hint: `${formatCount(customers.total)} total`,
    },
  ];

  return (
    <section aria-label="Summary">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-card ring-foreground/10 space-y-2 rounded-xl px-3 py-2 shadow-sm ring-1"
          >
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
        ))}
      </dl>
    </section>
  );
}
