import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getDashboardSnapshot,
  getDaybookDashboardWidget,
  getTradingDashboard,
  type DashboardSnapshot,
  type DaybookDashboardWidget,
  type TradingDashboard,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { CashBalanceCards } from "@desktop/pages/cash";

export function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [trading, setTrading] = useState<TradingDashboard | null>(null);
  const [daybook, setDaybook] = useState<DaybookDashboardWidget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      getDashboardSnapshot(),
      getTradingDashboard(),
      getDaybookDashboardWidget().catch(() => null),
    ])
      .then(([snap, trade, db]) => {
        if (!cancelled) {
          setData(snap);
          setTrading(trade);
          setDaybook(db);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.dashboard}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {data ? `${t.dashboard.overview} · ${data.asOfMonth}` : t.dashboard.overview}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !data ? <p className="muted">{t.common.loading}</p> : null}

      {daybook ? (
        <div className="section-card stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              {t.nav.dailyBook}
            </h2>
            <Link className="nav-link" to="/daybook">
              {t.common.view}
            </Link>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t.dashboard.thisMonthTransactions}</div>
              <div className="stat-value">{daybook.totalTransactions}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.common.credit}</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                {daybook.todaysProfit}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.common.debit}</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                {daybook.todaysExpenses}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.nav.hawala}</div>
              <div className="stat-value">{daybook.pendingHawalas}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.partner.commission}</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                {daybook.pendingSettlements}
              </div>
            </div>
          </div>
          {daybook.cash.length > 0 ? (
            <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
              {daybook.cash.map((c) => (
                <span key={c.currencyCode} className="badge badge-info">
                  {c.currencyCode}: {c.expectedClosing}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t.common.thisMonth}</div>
              <div className="stat-value">{data.month.transactions}</div>
              <div className="muted">
                {data.month.deposits} {t.transactions.deposit} · {data.month.withdrawals}{" "}
                {t.transactions.withdrawal} · {data.month.transfers} {t.nav.transfers}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.nav.exchange}</div>
              <div className="stat-value">{data.month.exchanges}</div>
              <div className="muted">{t.dashboard.postedFxDeals} · {data.asOfMonth}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.nav.hawala}</div>
              <div className="stat-value">{data.month.hawala}</div>
              <div className="muted">{t.common.thisMonth}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.nav.customers}</div>
              <div className="stat-value">{data.customers.active}</div>
              <div className="muted">
                {t.dashboard.totalCount.replace("{count}", String(data.customers.total))}
              </div>
            </div>
            {trading ? (
              <>
                <div className="stat-card">
                  <div className="stat-label">{t.nav.trading}</div>
                  <div className="stat-value" style={{ fontSize: "1.35rem" }}>
                    {trading.profitToday}
                  </div>
                  <div className="muted">
                    {trading.openPositions} {t.common.status}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t.nav.trading}</div>
                  <div className="stat-value" style={{ fontSize: "1.35rem" }}>
                    {trading.buysToday} / {trading.salesToday}
                  </div>
                  <div className="muted">
                    {t.common.balance} {trading.inventoryCostValue}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">{t.dashboard.businessCash}</h2>
              <Link className="nav-link" to="/cash">
                {t.dashboard.viewCash}
              </Link>
            </div>
            {data.cash.length === 0 ? (
              <p className="muted">{t.cash.noBalances}</p>
            ) : (
              <CashBalanceCards rows={data.cash} />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
