import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import {
  archiveTrade,
  listCurrenciesPage,
  listTradingTrades,
  type CurrencyListItem,
  type TradingTradeRow,
} from "@desktop/api";
import { ExchangeFormModal } from "@desktop/components/exchange-form-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import type { TradingOutletContext } from "@desktop/pages/trading/outlet-context";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";

export function TradingHistoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { reloadKey: layoutReload } = useOutletContext<TradingOutletContext>();
  const { showSuccess, successModal } = useSuccessModal();
  const { confirm } = useConfirmDialog();
  const dealModal = useExchangeDealDetailModal();
  const [items, setItems] = useState<TradingTradeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState("ALL");
  const [search, setSearch] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    trade: TradingTradeRow;
  } | null>(null);
  const pageSize = 25;

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((p) => setCurrencies(p.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listTradingTrades({
      page,
      pageSize,
      direction: direction === "ALL" ? undefined : direction,
      search: search.trim() || undefined,
      currencyCode: currencyCode || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
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
  }, [page, direction, search, currencyCode, dateFrom, dateTo, reloadKey, layoutReload]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function handleArchive(id: string, reference: string) {
    const ok = await confirm({
      title: t.common.archive,
      message: t.desk.archiveTradeConfirm.replace("{reference}", reference),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await archiveTrade(id);
      setReloadKey((k) => k + 1);
      showSuccess(t.common.success);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function openTrade(trade: TradingTradeRow) {
    if (trade.transactionId) {
      void dealModal.open(trade.transactionId);
      return;
    }
    navigate(`/trading/trades/${trade.id}`);
  }

  function openEditTrade(trade: TradingTradeRow) {
    if (trade.transactionId) {
      setEditTransactionId(trade.transactionId);
      setEditOpen(true);
      return;
    }
    navigate(`/trading/trades/${trade.id}`);
  }

  return (
    <section className="panel records-panel">
      <div className="records-chrome">
        <div className="records-title">
          <div>
            <h2>{t.desk.tradeHistory}</h2>
            <span className="count-badge">{total}</span>
          </div>
        </div>
        <div className="table-toolbar">
          <label className="search-field search-field-emphasized">
            <input
              type="search"
              className="desk-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t.common.search}
              aria-label={t.common.search}
            />
          </label>
          <div className="table-filters">
            <label>
              <span className="muted">{t.desk.direction}</span>
              <select
                value={direction}
                aria-label={t.desk.direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">{t.common.all}</option>
                <option value="BUY">{t.desk.purchases}</option>
                <option value="SELL">{t.desk.sales}</option>
              </select>
            </label>
            <CurrencyFilter
              currencies={currencies}
              value={currencyCode}
              onChange={(code) => {
                setCurrencyCode(code);
                setPage(1);
              }}
              allLabel={t.common.all}
              hideLabel
            />
            <label>
              <input
                type="date"
                value={dateFrom}
                aria-label={t.common.from}
                title={t.common.from}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              <input
                type="date"
                value={dateTo}
                aria-label={t.common.to}
                title={t.common.to}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        </div>
      </div>
      {error ? <p className="error" style={{ margin: 0, padding: "10px 12px" }}>{error}</p> : null}
      {busy ? <p className="muted" style={{ margin: 0, padding: "10px 12px" }}>{t.common.loading}</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t.desk.direction}</th>
              <th>{t.common.reference}</th>
              <th>{t.desk.held}</th>
              <th>{t.desk.ratePaid}</th>
              <th>{t.desk.paidReceived}</th>
              <th>{t.desk.avgCostPerUnit}</th>
              <th>{t.desk.profitLossShort}</th>
              <th>{t.desk.party}</th>
              <th>{t.common.date}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !busy ? (
              <tr>
                <td colSpan={9} className="muted">
                  {t.desk.noTradesMatch}
                </td>
              </tr>
            ) : null}
            {items.map((trade) => (
              <tr
                key={trade.id}
                className="customer-row-clickable"
                onClick={() => openTrade(trade)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setRowMenu({ x: e.clientX, y: e.clientY, trade });
                }}
              >
                <td>{statusLabel(t, trade.direction)}</td>
                <td>{trade.reference}</td>
                <td>
                  <strong>
                    {trade.quantity} {trade.inventoryCurrencyCode}
                  </strong>
                </td>
                <td>
                  {trade.rate} {trade.paymentCurrencyCode} / {trade.inventoryCurrencyCode}
                </td>
                <td>
                  {trade.paymentAmount} {trade.paymentCurrencyCode}
                </td>
                <td>
                  {trade.avgCostAtPost
                    ? `${trade.avgCostAtPost} ${trade.paymentCurrencyCode} / ${trade.inventoryCurrencyCode}`
                    : "—"}
                </td>
                <td>
                  {trade.grossProfit
                    ? `${trade.grossProfit} ${trade.paymentCurrencyCode}`
                    : "—"}
                </td>
                <td>{trade.counterpartyName ?? trade.counterpartyType}</td>
                <td>{trade.valueDate.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="records-pagination">
        <span>
          {t.desk.pageTotal
            .replace("{page}", String(page))
            .replace("{totalPages}", String(totalPages))
            .replace("{total}", String(total))}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="secondary"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            {t.common.previous}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            {t.common.next}
          </button>
        </div>
      </div>
      {successModal}
      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            {
              id: "edit",
              label: t.common.editAction,
              disabled: busy,
              onSelect: () => openEditTrade(rowMenu.trade),
            },
            {
              id: "delete",
              label: t.common.delete,
              danger: true,
              disabled: busy,
              onSelect: () =>
                void handleArchive(rowMenu.trade.id, rowMenu.trade.reference),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
      <ExchangeFormModal
        open={editOpen}
        editTransactionId={editTransactionId}
        onClose={() => {
          setEditOpen(false);
          setEditTransactionId(null);
        }}
        onSaved={() => {
          setReloadKey((k) => k + 1);
          showSuccess(t.common.success);
        }}
      />
      <ExchangeDealDetailModal
        detail={dealModal.detail}
        busy={dealModal.busy}
        error={dealModal.error}
        onClose={dealModal.close}
      />
    </section>
  );
}
