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

type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/transactions",
    label: "New Deposit",
    description: "Receive customer cash",
    icon: ArrowDownToLine,
  },
  {
    href: "/transactions",
    label: "New Withdrawal",
    description: "Pay out to a customer",
    icon: ArrowUpFromLine,
  },
  {
    href: "/exchange",
    label: "New Exchange",
    description: "Convert currencies",
    icon: ArrowLeftRight,
  },
  {
    href: "/hawala",
    label: "New Hawala",
    description: "Send or receive hawala",
    icon: Send,
  },
  {
    href: "/transfers",
    label: "New Transfer",
    description: "Move between customers",
    icon: ArrowRightLeft,
  },
];

export function DashboardQuickActions() {
  return (
    <section
      className="bg-card ring-foreground/10 space-y-5 rounded-xl p-5 shadow-sm ring-1 sm:p-6"
      aria-labelledby="dashboard-actions-heading"
    >
      <div className="space-y-1">
        <Typography
          variant="h4"
          id="dashboard-actions-heading"
          className="font-bold"
        >
          Quick Actions
        </Typography>
        <Typography variant="muted">
          Jump to a desk workflow to post a new movement.
        </Typography>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <li key={action.label}>
              <Link
                href={action.href}
                className="hover:bg-muted/40 focus-visible:ring-ring flex items-start gap-3 rounded-xl px-3 py-3 ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 space-y-0.5">
                  <Typography variant="bodySm" as="span" className="font-semibold">
                    {action.label}
                  </Typography>
                  <Typography variant="caption" as="span" className="block">
                    {action.description}
                  </Typography>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
