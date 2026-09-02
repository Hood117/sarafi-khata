import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import {
  listTradingInventory,
  type TradingInventoryRow,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import type { TradingOutletContext } from "@desktop/pages/trading/outlet-context";

function money(amount: string, currency: string) {
  return `${amount} ${currency}`;
}

function ratePerUnit(rate: string, payCcy: string, invCcy: string) {
  return `${rate} ${payCcy} / ${invCcy}`;
}

export function TradingInventoryPage() {
  const t = useT();
  const { reloadKey } = useOutletContext<TradingOutletContext>();
  const [rows, setRows] = useState<TradingInventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listTradingInventory()
      .then((data) => {
        if (!cancelled) {
          setRows(data);
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

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      r.currencyCode.toLowerCase().includes(s) ||
      r.avgCostCurrencyCode.toLowerCase().includes(s)
    );
  });

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {t.desk.currencyInventory}
        </h2>
        <input
          type="search"
          className="desk-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.common.search}
          style={{ maxWidth: "14rem" }}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {busy ? <p className="muted">{t.common.loading}</p> : null}
      {!busy && filtered.length === 0 ? (
        <p className="muted">{t.desk.noOpenInventory}</p>
      ) : null}
      {filtered.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>{t.desk.held}</th>
              <th>{t.desk.avgCostPerUnit}</th>
              <th>{t.desk.costBasis}</th>
              <th>{t.desk.marketRate}</th>
              <th>{t.desk.unrealized}</th>
              <th>{t.desk.lastBuy}</th>
              <th>{t.desk.lastSale}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.currencyId}>
                <td>
                  <strong>{money(r.quantity, r.currencyCode)}</strong>
                </td>
                <td>{ratePerUnit(r.avgCost, r.avgCostCurrencyCode, r.currencyCode)}</td>
                <td>{money(r.costValue, r.avgCostCurrencyCode)}</td>
                <td>
                  {r.marketRate
                    ? ratePerUnit(r.marketRate, r.avgCostCurrencyCode, r.currencyCode)
                    : "—"}
                </td>
                <td>
                  {r.unrealizedPnl
                    ? money(r.unrealizedPnl, r.avgCostCurrencyCode)
                    : "—"}
                </td>
                <td>{r.lastPurchaseAt?.slice(0, 10) ?? "—"}</td>
                <td>{r.lastSaleAt?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
