import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Repeat2,
  Send,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { CashBalanceRow, DashboardSnapshot } from "@desktop/api";
import { useCashTracking } from "@desktop/cash-tracking";
import { useT } from "@desktop/i18n";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import { animateDashboard, useGSAP } from "@desktop/lib/motion";
import { parseSignedAmountNumber } from "@desktop/lib/western-digits";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";

type Tone = "blue" | "green" | "rose" | "amber" | "slate" | "teal" | "violet";

const TONE_COLOR: Record<Tone, string> = {
  blue: "var(--accent-blue, #5483b3)",
  green: "var(--money-in)",
  rose: "var(--money-out)",
  amber: "var(--warning, #9b8050)",
  slate: "var(--fg-muted, var(--ink-soft))",
  teal: "var(--success, #237f69)",
  violet: "#6b7fd7",
};

const CURRENCY_ACCENT: Record<string, string> = {
  USD: "#052659",
  AFN: "#5483b3",
  EUR: "#3c679d",
  PKR: "#237f69",
  AED: "#163d6d",
  GBP: "#bc4a51",
  SAR: "#237f69",
  QAR: "#7a879b",
  IRR: "#021024",
  TRY: "#bc4a51",
};

type Props = {
  data: DashboardSnapshot;
  todayCashIn: string;
  todayCashOut: string;
  baseCurrency: string;
  loading?: boolean;
};

function currencyAccent(code: string): string {
  return CURRENCY_ACCENT[code.toUpperCase()] ?? "#052659";
}

function cashNumber(balance: string): number {
  const n = parseSignedAmountNumber(balance);
  return Number.isFinite(n) ? n : 0;
}

function BusinessCashCards({ cash }: { cash: CashBalanceRow[] }) {
  const t = useT();
  const rows = cash
    .map((row) => ({
      code: row.currencyCode,
      balance: row.balanceDisplay,
      abs: Math.abs(cashNumber(row.balanceDisplay)),
      symbol: row.currencySymbol,
    }))
    .filter((row) => row.abs !== 0)
    .sort((a, b) => b.abs - a.abs);

  return (
    <section className="dashboard-cash-panel">
      <div className="dashboard-cash-head">
        <h2>{t.dashboard.businessCash}</h2>
        <Link className="text-link" to="/cash">
          {t.dashboard.viewCash}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t.cash.noBalances}</p>
      ) : (
        <div className="cash-card-grid">
          {rows.map((row) => {
            const accent = currencyAccent(row.code);
            return (
              <article
                key={row.code}
                className="cash-balance-card"
                style={{ ["--cash-accent" as string]: accent }}
              >
                <div className="cash-balance-card-top">
                  <CurrencyCodeWithFlag code={row.code} />
                  <span className="cash-balance-icon" aria-hidden>
                    <Banknote size={15} />
                  </span>
                </div>
                <div className="cash-balance-amount-block">
                  {row.symbol ? (
                    <span className="cash-balance-symbol">{row.symbol}</span>
                  ) : null}
                  <div className={`cash-balance-amount ${moneyToneClass(row.balance)}`}>
                    {row.balance}
                  </div>
                </div>
                <div className="cash-balance-meta">{t.cash.shopCash}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ActivityBars({
  items,
}: {
  items: { label: string; value: number; tone: Tone }[];
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="dashboard-bars" role="img" aria-label="Monthly activity chart">
      {items.map((item) => {
        const height = Math.max(8, Math.round((item.value / max) * 100));
        return (
          <div className="dashboard-bar-col" key={item.label}>
            <span className="dashboard-bar-value">{item.value}</span>
            <div className="dashboard-bar-track">
              <div
                className="dashboard-bar-fill"
                style={{
                  height: `${height}%`,
                  background: TONE_COLOR[item.tone],
                }}
              />
            </div>
            <span className="dashboard-bar-label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActivityDonut({
  items,
  emptyLabel,
  centerLabel,
}: {
  items: { label: string; value: number; tone: Tone }[];
  emptyLabel: string;
  centerLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const size = 180;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = items
    .filter((item) => item.value > 0)
    .reduce<{ label: string; value: number; tone: Tone; length: number; offset: number }[]>(
      (acc, item) => {
        const length = total ? (item.value / total) * circumference : 0;
        const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].length : 0;
        acc.push({ ...item, length, offset });
        return acc;
      },
      [],
    );

  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut-visual">
        <svg viewBox={`0 0 ${size} ${size}`} className="dashboard-donut" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-subtle, var(--line))"
            strokeWidth={stroke}
          />
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONE_COLOR[seg.tone]}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        <div className="dashboard-donut-center">
          <strong>{total.toLocaleString("en-US")}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="dashboard-donut-legend">
        {items.every((item) => item.value === 0) ? (
          <li className="muted">{emptyLabel}</li>
        ) : (
          items.map((item) => {
            const pct = total ? Math.round((item.value / total) * 100) : 0;
            return (
              <li key={item.label}>
                <span
                  className="dashboard-legend-swatch"
                  style={{ background: TONE_COLOR[item.tone] }}
                />
                <span className="dashboard-legend-label">{item.label}</span>
                <span className="dashboard-legend-meta">
                  {item.value} · {pct}%
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function DashboardBoard({
  data,
  todayCashIn,
  todayCashOut,
  baseCurrency,
}: Props) {
  const t = useT();
  const { cashTrackingEnabled } = useCashTracking();
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!rootRef.current) return;
      animateDashboard(rootRef.current);
    },
    {
      scope: rootRef,
      dependencies: [
        data.month.deposits,
        data.month.withdrawals,
        data.month.transfers,
        data.month.exchanges,
        data.month.hawala,
        data.customers.active,
        data.customers.newThisMonth,
      ],
      revertOnUpdate: true,
    },
  );

  const deposits = data.month.deposits;
  const withdrawals = data.month.withdrawals;
  const transfers = data.month.transfers;
  const exchanges = data.month.exchanges;
  const hawala = data.month.hawala;
  const newCustomers = data.customers.newThisMonth;
  const activeCustomers = data.customers.active;
  const totalOps = deposits + withdrawals + transfers + exchanges + hawala;

  const activityItems = [
    { label: t.dashboard.deposits, value: deposits, tone: "green" as const },
    { label: t.dashboard.withdrawals, value: withdrawals, tone: "rose" as const },
    { label: t.nav.transfers, value: transfers, tone: "blue" as const },
    { label: t.dashboard.exchanges, value: exchanges, tone: "teal" as const },
    { label: t.nav.hawala, value: hawala, tone: "amber" as const },
  ];

  const stats: {
    label: string;
    value: number;
    hint: string;
    tone: Tone;
    Icon: LucideIcon;
  }[] = [
    {
      label: t.dashboard.deposits,
      value: deposits,
      hint: t.common.thisMonth,
      tone: "green",
      Icon: ArrowDownLeft,
    },
    {
      label: t.dashboard.withdrawals,
      value: withdrawals,
      hint: t.common.thisMonth,
      tone: "rose",
      Icon: ArrowUpRight,
    },
    {
      label: t.nav.transfers,
      value: transfers,
      hint: t.common.thisMonth,
      tone: "blue",
      Icon: ArrowLeftRight,
    },
    {
      label: t.dashboard.exchanges,
      value: exchanges,
      hint: t.common.thisMonth,
      tone: "teal",
      Icon: Repeat2,
    },
    {
      label: t.dashboard.newCustomers,
      value: newCustomers,
      hint: t.common.thisMonth,
      tone: "violet",
      Icon: UserPlus,
    },
    {
      label: t.dashboard.activeCustomers,
      value: activeCustomers,
      hint: t.dashboard.currentlyActive,
      tone: "slate",
      Icon: Users,
    },
    {
      label: t.nav.hawala,
      value: hawala,
      hint: t.common.thisMonth,
      tone: "amber",
      Icon: Send,
    },
  ];

  return (
    <div className="dashboard-home" ref={rootRef}>
      <div className="dashboard-day-strip">
        <div className="dashboard-day-item">
          <span>{t.common.today}</span>
          <strong className="money-in">
            {todayCashIn} <small>{baseCurrency}</small>
          </strong>
          <em>{t.dailyBook.totalDebit}</em>
        </div>
        <div className="dashboard-day-item">
          <span>{t.common.today}</span>
          <strong className="money-out">
            {todayCashOut} <small>{baseCurrency}</small>
          </strong>
          <em>{t.dailyBook.totalCredit}</em>
        </div>
        <div className="dashboard-day-item">
          <span>{t.common.thisMonth}</span>
          <strong data-count={totalOps}>{totalOps.toLocaleString("en-US")}</strong>
          <em>{t.dashboard.thisMonthTransactions}</em>
        </div>
      </div>

      <div className="dashboard-charts">
        <section className="dashboard-chart-panel">
          <div className="dashboard-cash-head">
            <h2>{t.dashboard.monthlyActivity}</h2>
            <span className="dashboard-chart-sub">{t.dashboard.activityCounts}</span>
          </div>
          <ActivityBars items={activityItems} />
        </section>
        <section className="dashboard-chart-panel">
          <div className="dashboard-cash-head">
            <h2>{t.dashboard.mixByType}</h2>
            <span className="dashboard-chart-sub">{t.dashboard.activityShare}</span>
          </div>
          <ActivityDonut
            items={activityItems}
            emptyLabel={t.dashboard.noTypeMix}
            centerLabel={t.dashboard.thisMonthTransactions}
          />
        </section>
      </div>

      <div className="dashboard-stat-grid">
        {stats.map((stat) => {
          const Icon = stat.Icon;
          return (
            <article
              className="dashboard-stat-card"
              key={stat.label}
              style={{ ["--kpi-accent" as string]: TONE_COLOR[stat.tone] }}
            >
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">{stat.label}</span>
                <span className="dashboard-stat-icon" aria-hidden>
                  <Icon size={14} />
                </span>
              </div>
              <strong className="dashboard-stat-value" data-count={stat.value}>
                {stat.value.toLocaleString("en-US")}
              </strong>
              <span className="dashboard-stat-hint">{stat.hint}</span>
            </article>
          );
        })}
      </div>

      {cashTrackingEnabled ? <BusinessCashCards cash={data.cash} /> : null}
    </div>
  );
}
