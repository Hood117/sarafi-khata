import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  archiveTrade,
  getTradingDashboard,
  listTradingTrades,
  type TradingDashboard,
  type TradingTradeRow,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { Pagination } from "@desktop/ui/pagination";

function day(iso: string) {
  return iso.slice(0, 10) || iso;
}

const PAGE_SIZE = 25;

export function TradingDashboardPage() {
  const t = useT();
  const [data, setData] = useState<TradingDashboard | null>(null);
  const [trades, setTrades] = useState<TradingTradeRow[]>([]);
  const [tradesTotal, setTradesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [listBusy, setListBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void getTradingDashboard()
      .then((dash) => {
        if (!cancelled) {
          setData(dash);
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
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setListBusy(true);
    void listTradingTrades({
      page,
      pageSize: PAGE_SIZE,
      direction: direction === "ALL" ? undefined : direction,
      search: search.trim() || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setTrades(result.items);
          setTradesTotal(result.total);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setListBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, direction, page, reloadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, direction]);

  const filteredHint = useMemo(() => {
    if (direction === "ALL" && !search.trim()) return t.desk.recentTrades;
    return t.desk.filteredTrades;
  }, [direction, search, t]);

  async function handleArchive(id: string, reference: string) {
    if (!window.confirm(t.desk.archiveTradeConfirm.replace("{reference}", reference))) {
      return;
    }
    setBusy(true);
    try {
      await archiveTrade(id);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      {busy && !data ? <p className="muted">{t.common.loading}</p> : null}
      {data ? (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t.desk.profitToday}</div>
              <div className="stat-value">{data.profitToday}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.profitMonth}</div>
              <div className="stat-value">{data.profitMonth}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.openPositions}</div>
              <div className="stat-value">{data.openPositions}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.inventoryCost}</div>
              <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                {data.inventoryCostValue}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.buysToday}</div>
              <div className="stat-value">{data.buysToday}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.salesToday}</div>
              <div className="stat-value">{data.salesToday}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.closedMonth}</div>
              <div className="stat-value">{data.closedTradesMonth}</div>
            </div>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="section-title">{filteredHint}</h2>
            </div>
            <div className="row">
              <label style={{ flex: 1, minWidth: "12rem" }}>
                {t.common.search}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.common.search}
                />
              </label>
              <label>
                {t.desk.direction}
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="BUY">{t.desk.purchases}</option>
                  <option value="SELL">{t.desk.sales}</option>
                </select>
              </label>
            </div>
            {listBusy && trades.length === 0 ? (
              <p className="muted">{t.desk.loadingTrades}</p>
            ) : trades.length === 0 ? (
              <p className="muted">{t.desk.noTradesMatch}</p>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>{t.desk.direction}</th>
                      <th>{t.common.reference}</th>
                      <th>{t.desk.held}</th>
                      <th>{t.desk.ratePaid}</th>
                      <th>{t.desk.paidReceived}</th>
                      <th>{t.desk.profitLossShort}</th>
                      <th>{t.desk.party}</th>
                      <th>{t.common.date}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.id}>
                        <td>{statusLabel(t, trade.direction)}</td>
                        <td>
                          <Link to={`/trading/trades/${trade.id}`}>{trade.reference}</Link>
                        </td>
                        <td>
                          <strong>
                            {trade.quantity} {trade.inventoryCurrencyCode}
                          </strong>
                        </td>
                        <td>
                          {trade.rate} {trade.paymentCurrencyCode} /{" "}
                          {trade.inventoryCurrencyCode}
                        </td>
                        <td>
                          {trade.paymentAmount} {trade.paymentCurrencyCode}
                        </td>
                        <td>
                          {trade.grossProfit
                            ? `${trade.grossProfit} ${trade.paymentCurrencyCode}`
                            : "—"}
                        </td>
                        <td>{trade.counterpartyName ?? trade.counterpartyType}</td>
                        <td>{day(trade.valueDate)}</td>
                        <td className="row" style={{ gap: "0.35rem" }}>
                          <Link
                            className="button-link secondary"
                            to={`/trading/trades/${trade.id}`}
                          >
                            {t.common.edit}
                          </Link>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void handleArchive(trade.id, trade.reference)}
                          >
                            {t.common.archive}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={tradesTotal}
                  busy={listBusy}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
