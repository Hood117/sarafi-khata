import { useRef } from "react";
import { Link } from "react-router-dom";

import type { CashBalanceRow, DashboardSnapshot, ExchangeRateItem } from "@desktop/api";
import { useLocale } from "@desktop/i18n";
import { animateDashboard, useGSAP } from "@desktop/lib/motion";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";

type Tone = {
  key: string;
  label: string;
  value: number;
  color: string;
};

const TONE = {
  deposit: "var(--brand)",
  withdraw: "var(--money-out)",
  transfer: "var(--money-in)",
  exchange: "var(--accent)",
  hawala: "var(--brand-deep)",
  buy: "color-mix(in srgb, var(--brand) 62%, white)",
  sell: "color-mix(in srgb, var(--accent) 70%, var(--brand-deep))",
  cash: "var(--brand)",
};

function monthTitle(monthKey: string, fallback: string, intlLocale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return fallback;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return fallback;
  }
}

function percentShares(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < left; i += 1) {
    floors[order[i % order.length].index] += 1;
  }
  return floors;
}

function minorAbs(row: CashBalanceRow): number {
  const minor = Number(row.amountMinor);
  if (Number.isFinite(minor)) return Math.abs(minor);
  const parsed = Number.parseFloat(String(row.balanceDisplay).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function MovementBars({ rows }: { rows: Tone[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="dash-vbars" role="list">
      {rows.map((row) => (
        <div className="dash-vbar" role="listitem" key={row.key}>
          <span className="dash-vbar-value">{row.value}</span>
          <span className="dash-vbar-plot" aria-hidden>
            <span
              className="dash-vbar-fill"
              style={{
                height: row.value === 0 ? "4px" : `${Math.max(8, (row.value / max) * 100)}%`,
                background: row.color,
              }}
            />
          </span>
          <span className="dash-vbar-label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

function piePath(start: number, sweep: number): string {
  const radius = 38;
  const cx = 50;
  const cy = 50;
  const end = start + sweep;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function MixPie({ rows }: { rows: Tone[] }) {
  const shown = rows.filter((row) => row.value > 0);
  const total = shown.reduce((sum, row) => sum + row.value, 0);
  const shares = percentShares(shown.map((row) => row.value));
  let angle = -Math.PI / 2;

  return (
    <div className="dash-mix">
      <div className="dash-pie" aria-hidden>
        <svg viewBox="0 0 100 100">
          {shown.length === 1 ? (
            <circle cx="50" cy="50" r="38" fill={shown[0].color} />
          ) : (
            shown.map((row) => {
              const sweep = (row.value / total) * Math.PI * 2;
              const d = piePath(angle, Math.max(sweep - 0.02, 0.01));
              angle += sweep;
              return <path key={row.key} d={d} fill={row.color} />;
            })
          )}
        </svg>
      </div>
      <ul className="dash-legend">
        {shown.map((row, index) => (
          <li key={row.key}>
            <span className="dash-swatch" style={{ background: row.color }} />
            <span className="dash-legend-label">{row.label}</span>
            <span className="dash-legend-count">{row.value}</span>
            <span className="dash-pill">{shares[index]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CashBars({ rows }: { rows: CashBalanceRow[] }) {
  const ranked = [...rows].sort((a, b) => minorAbs(b) - minorAbs(a)).slice(0, 8);
  const max = Math.max(...ranked.map(minorAbs), 1);
  return (
    <div className="dash-bars" role="list">
      {ranked.map((row) => {
        const magnitude = minorAbs(row);
        const negative = Number(row.amountMinor) < 0;
        const low = row.condition === "LOW";
        const color = negative ? TONE.withdraw : low ? TONE.exchange : TONE.cash;
        return (
          <div className="dash-bar" role="listitem" key={row.currencyCode}>
            <span className="dash-bar-label dash-bar-code">
              <CurrencyCodeWithFlag code={row.currencyCode} />
            </span>
            <span className="dash-bar-track" aria-hidden>
              <span
                className="dash-bar-fill"
                style={{
                  width: `${Math.max(magnitude === 0 ? 2 : 4, (magnitude / max) * 100)}%`,
                  background: color,
                }}
              />
            </span>
            <span className="dash-bar-value" dir="ltr">
              {row.balanceDisplay}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RateList({ rates }: { rates: ExchangeRateItem[] }) {
  return (
    <ul className="dash-rates">
      {rates.slice(0, 6).map((rate) => (
        <li key={rate.id}>
          <span dir="ltr">
            {rate.baseCode}/{rate.quoteCode}
          </span>
          <strong dir="ltr">{rate.rate}</strong>
        </li>
      ))}
    </ul>
  );
}

function shareOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function DashboardBoard({ data }: { data: DashboardSnapshot }) {
  const { t, intlLocale } = useLocale();
  const series: Tone[] = [
    {
      key: "deposit",
      label: t.dashboard.deposits,
      value: data.month.deposits,
      color: TONE.deposit,
    },
    {
      key: "withdraw",
      label: t.dashboard.withdrawals,
      value: data.month.withdrawals,
      color: TONE.withdraw,
    },
    {
      key: "transfer",
      label: t.nav.transfers,
      value: data.month.transfers,
      color: TONE.transfer,
    },
    {
      key: "exchange",
      label: t.dashboard.exchanges,
      value: data.month.exchanges,
      color: TONE.exchange,
    },
    {
      key: "hawala",
      label: t.nav.hawala,
      value: data.month.hawala,
      color: TONE.hawala,
    },
    ...(data.month.tradeBuys > 0
      ? [
          {
            key: "buy",
            label: t.txLine.typeTradeBuy,
            value: data.month.tradeBuys,
            color: TONE.buy,
          },
        ]
      : []),
    ...(data.month.tradeSells > 0
      ? [
          {
            key: "sell",
            label: t.txLine.typeTradeSell,
            value: data.month.tradeSells,
            color: TONE.sell,
          },
        ]
      : []),
  ];
  const movementTotal = series.reduce((sum, row) => sum + row.value, 0);
  const month = monthTitle(data.monthKey, data.asOfMonth, intlLocale);
  const cashRows = data.cash.filter((row) => minorAbs(row) > 0);
  const customerTotal = data.customers.total;
  const activeShare = shareOf(data.customers.active, customerTotal);
  const newShare = shareOf(data.customers.newThisMonth, customerTotal);
  const inactiveCount = Math.max(customerTotal - data.customers.active, 0);
  const inactiveShare = shareOf(inactiveCount, customerTotal);
  const boardRef = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (boardRef.current) animateDashboard(boardRef.current);
    },
    { scope: boardRef },
  );

  return (
    <section ref={boardRef} className="dash-board" aria-label={t.dashboard.overview}>
      <header className="dash-board-head">
        <div>
          <h2 className="dash-board-title">{t.dashboard.overview}</h2>
          <p className="dash-board-sub">
            {month}
            <span aria-hidden> · </span>
            {t.dashboard.postedCount.replace("{count}", String(data.month.transactions))}
          </p>
        </div>
      </header>

      <div className="dash-top">
        <div className="dash-kpis">
          <article className="dash-kpi dash-kpi-hero">
            <span>{t.dashboard.thisMonthTransactions}</span>
            <strong data-count={data.month.transactions}>{data.month.transactions}</strong>
            <em>{t.common.thisMonth}</em>
          </article>
          <article className="dash-kpi">
            <span>{t.dashboard.deposits}</span>
            <strong data-count={data.month.deposits}>{data.month.deposits}</strong>
            <em>{t.common.thisMonth}</em>
          </article>
          <article className="dash-kpi">
            <span>{t.dashboard.withdrawals}</span>
            <strong data-count={data.month.withdrawals}>{data.month.withdrawals}</strong>
            <em>{t.common.thisMonth}</em>
          </article>
          <article className="dash-kpi">
            <span>{t.dashboard.activeCustomers}</span>
            <strong data-count={data.customers.active}>{data.customers.active}</strong>
            <em>
              {t.dashboard.totalCount.replace("{count}", String(data.customers.total))}
            </em>
          </article>
        </div>

        <article className="dash-panel dash-panel-mix">
          <div className="dash-panel-head">
            <h3>{t.dashboard.mixByType}</h3>
            <span>{t.common.thisMonth}</span>
          </div>
          {movementTotal === 0 ? (
            <p className="dash-empty">{t.dashboard.noTypeMix}</p>
          ) : (
            <MixPie rows={series} />
          )}
        </article>
      </div>

      <div className="dash-board-grid">
        <article className="dash-panel">
          <div className="dash-panel-head">
            <h3>{t.dashboard.monthlyActivity}</h3>
            <span>{t.common.thisMonth}</span>
          </div>
          {movementTotal === 0 ? (
            <p className="dash-empty">{t.dashboard.noMovementsThisMonth}</p>
          ) : (
            <MovementBars rows={series} />
          )}
        </article>

        <article className="dash-panel dash-growth-card">
          <div className="dash-panel-head">
            <h3>{t.dashboard.activeCustomers}</h3>
            <Link className="dash-more" to="/customers">
              {t.common.view}
            </Link>
          </div>
          <div className="dash-growth">
            <ul className="dash-customer-stats" aria-label={t.dashboard.activeCustomers}>
              <li>
                <strong data-count={activeShare} data-suffix="%">
                  {activeShare}%
                </strong>
                <span>{t.dashboard.activeCustomers}</span>
                <em data-count={data.customers.active}>{data.customers.active}</em>
              </li>
              <li>
                <strong data-count={newShare} data-suffix="%">
                  {newShare}%
                </strong>
                <span>{t.dashboard.newCustomers}</span>
                <em data-count={data.customers.newThisMonth}>{data.customers.newThisMonth}</em>
              </li>
              <li>
                <strong data-count={inactiveShare} data-suffix="%">
                  {inactiveShare}%
                </strong>
                <span>{t.common.inactive}</span>
                <em data-count={inactiveCount}>{inactiveCount}</em>
              </li>
            </ul>
            <div className="dash-growth-side">
              <div className="dash-panel-head">
                <h3>{t.dashboard.businessCash}</h3>
                <Link className="dash-more" to="/cash">
                  {t.dashboard.viewCash}
                </Link>
              </div>
              {cashRows.length === 0 ? (
                <p className="dash-empty">{t.cash.noBalances}</p>
              ) : (
                <CashBars rows={cashRows} />
              )}
              {data.rates.length > 0 ? (
                <>
                  <div className="dash-panel-head dash-panel-head-sub">
                    <h3>{t.exchangeRates.deskRatesTitle}</h3>
                    <Link className="dash-more" to="/rates">
                      {t.common.view}
                    </Link>
                  </div>
                  <RateList rates={data.rates.slice(0, 4)} />
                </>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
