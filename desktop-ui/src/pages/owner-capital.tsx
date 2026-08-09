import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  getOwnerCapitalSnapshot,
  listCurrenciesPage,
  listOwnerCapitalEvents,
  listWalletsPage,
  postOwnerCapitalMove,
  transferCashBetweenVaults,
  type CapitalCurrencyBreakdown,
  type CurrencyListItem,
  type OwnerCapitalEventRow,
  type OwnerCapitalSnapshot,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { IconCapital, IconDashboard, IconHistory } from "@desktop/icons";
import { Pagination } from "@desktop/ui/pagination";
import { Stat } from "@desktop/ui/stat";
import { useT } from "@desktop/i18n";

function currencyOptionLabel(c: Pick<CurrencyListItem, "code" | "name" | "symbol">) {
  const sym = c.symbol?.trim();
  return sym ? `${c.code} — ${c.name} (${sym})` : `${c.code} — ${c.name}`;
}

function currencyTitle(row: CapitalCurrencyBreakdown) {
  return currencyOptionLabel({
    code: row.currencyCode,
    name: row.currencyName || row.currencyCode,
    symbol: row.currencySymbol,
  });
}

export function OwnerCapitalPage() {
  const t = useT();
  const { session } = useAuth();
  const [snap, setSnap] = useState<OwnerCapitalSnapshot | null>(null);
  const [events, setEvents] = useState<OwnerCapitalEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const eventsPageSize = 25;
  const [wallets, setWallets] = useState<WalletListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<"overview" | "invest" | "history">("overview");

  const [kind, setKind] = useState<"INVEST" | "WITHDRAW">("INVEST");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [cashWalletId, setCashWalletId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [xferAmount, setXferAmount] = useState("");
  const [xferCurrency, setXferCurrency] = useState("USD");

  const loadCore = useCallback(async () => {
    setBusy(true);
    try {
      const [s, w, c] = await Promise.all([
        getOwnerCapitalSnapshot(),
        listWalletsPage({ page: 1, pageSize: 100 }),
        listCurrenciesPage({ page: 1, pageSize: 200 }),
      ]);
      setSnap(s);
      const cash = w.items.filter((x) => x.type === "VAULT" || x.type === "TILL");
      setWallets(cash);
      setCurrencies(c.items);
      if (!cashWalletId && cash[0]) setCashWalletId(cash[0].id);
      if (!fromWalletId && cash[0]) setFromWalletId(cash[0].id);
      if (!toWalletId && cash[1]) setToWalletId(cash[1].id);
      if (c.items[0] && !currencyCode) setCurrencyCode(c.items[0].code);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [cashWalletId, currencyCode, fromWalletId, toWalletId]);

  const loadEvents = useCallback(async () => {
    try {
      const ev = await listOwnerCapitalEvents({
        page: eventsPage,
        pageSize: eventsPageSize,
      });
      setEvents(ev.items);
      setEventsTotal(ev.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [eventsPage]);

  useEffect(() => {
    void loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const load = useCallback(async () => {
    await loadCore();
    await loadEvents();
  }, [loadCore, loadEvents]);

  const cashWallets = useMemo(() => wallets, [wallets]);

  const filteredRow = useMemo(() => {
    if (!snap || !currencyFilter) return null;
    return snap.byCurrency.find((r) => r.currencyCode === currencyFilter) ?? null;
  }, [snap, currencyFilter]);

  const filterOptions = useMemo(() => {
    const map = new Map<string, CurrencyListItem>();
    for (const c of currencies) map.set(c.code, c);
    if (snap) {
      for (const row of snap.byCurrency) {
        if (!map.has(row.currencyCode)) {
          map.set(row.currencyCode, {
            id: row.currencyId,
            code: row.currencyCode,
            name: row.currencyName || row.currencyCode,
            symbol: row.currencySymbol,
            decimalPlaces: 2,
            isActive: true,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [currencies, snap]);

  async function onCapitalMove(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId) return;
    setSaving(true);
    setError(null);
    try {
      await postOwnerCapitalMove({
        kind,
        currencyCode,
        amount,
        cashWalletId,
        reason: reason || undefined,
        notes: notes || undefined,
        createdById: session.userId,
      });
      setAmount("");
      setReason("");
      setNotes("");
      await load();
      setTab("history");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onVaultTransfer(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId) return;
    setSaving(true);
    setError(null);
    try {
      await transferCashBetweenVaults({
        fromWalletId,
        toWalletId,
        currencyCode: xferCurrency,
        amount: xferAmount,
        createdById: session.userId,
      });
      setXferAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.ownerCapital}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.desk.capitalCalculationFormula}
        </p>
      </div>

      <div className="nav-row">
        {(
          [
            ["overview", t.nav.dashboard, <IconDashboard key="o" />],
            ["invest", t.desk.investmentTab, <IconCapital key="i" />],
            ["history", t.common.history, <IconHistory key="h" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "nav-link active" : "nav-link"}
            onClick={() => setTab(id)}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
          {t.desk.refresh}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !snap ? <p className="muted">{t.common.loading}</p> : null}

      {tab === "overview" && snap ? (
        <>
          <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: "0.75rem" }}>
            <label className="stack" style={{ gap: "0.25rem", minWidth: "16rem" }}>
              <span className="muted">{t.desk.filterByCurrency}</span>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
              >
                <option value="">{t.desk.allCurrenciesFilter}</option>
                {filterOptions.map((c) => (
                  <option key={c.id} value={c.code}>
                    {currencyOptionLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            {currencyFilter ? (
              <p className="muted" style={{ margin: 0 }}>
                {t.desk.viewingCurrency.replace(
                  "{currency}",
                  filteredRow
                    ? currencyTitle(filteredRow)
                    : currencyFilter,
                )}
              </p>
            ) : null}
          </div>

          {currencyFilter && filteredRow ? (
            <>
              <div className="stat-grid">
                <Stat
                  label={t.desk.totalBusinessCapital}
                  value={`${filteredRow.ownerCapital} ${filteredRow.currencyCode}`}
                  hint={currencyTitle(filteredRow)}
                />
                <Stat
                  label={t.desk.netWorth}
                  value={`${filteredRow.ownerCapital} ${filteredRow.currencyCode}`}
                  hint={t.desk.ownerCapitalIdentity}
                />
                <Stat
                  label={t.desk.totalCash}
                  value={`${filteredRow.cash} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.desk.customerFunds}
                  value={`${filteredRow.customerFunds} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.desk.partnerPayables}
                  value={`${filteredRow.partnerPayable} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.desk.pendingHawalas}
                  value={`${filteredRow.pendingHawala} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.reports.receivables}
                  value={`${filteredRow.partnerReceivable} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.reports.tradingInventory}
                  value={`${filteredRow.tradingInventoryCost} ${filteredRow.currencyCode}`}
                />
                <Stat
                  label={t.desk.commissionProfit}
                  value={`${filteredRow.commissionIncome} ${filteredRow.currencyCode}`}
                />
              </div>
              <div className="section-card stack">
                <h2>{t.desk.capitalCalculation}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {t.desk.capitalCalculationFormula}
                </p>
                <div
                  className="row"
                  style={{ gap: "1rem", flexWrap: "wrap", fontFamily: "monospace" }}
                >
                  <span>
                    {filteredRow.cash} {filteredRow.currencyCode}
                  </span>
                  <span>
                    − {filteredRow.customerFunds}
                  </span>
                  <span>
                    − {filteredRow.partnerPayable}
                  </span>
                  <span>
                    − {filteredRow.pendingHawala}
                  </span>
                  <span>
                    + {filteredRow.partnerReceivable}
                  </span>
                  <span>
                    + {filteredRow.tradingInventoryCost}
                  </span>
                  <span>
                    ={" "}
                    <strong>
                      {filteredRow.ownerCapital} {filteredRow.currencyCode}
                    </strong>
                  </span>
                </div>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {t.desk.pnlAllCurrenciesNote}
              </p>
              <div className="stat-grid">
                <Stat label={t.desk.profitToday} value={snap.profitToday} />
                <Stat label={t.desk.monthlyProfit} value={snap.profitMonth} />
                <Stat label={t.desk.realizedTradingProfit} value={snap.tradingProfitMonth} />
                <Stat
                  label={t.desk.exchangeActivity}
                  value={String(snap.exchangeCountMonth)}
                  hint={t.desk.exchangesThisMonth}
                />
              </div>
            </>
          ) : currencyFilter && !filteredRow ? (
            <p className="muted">{t.desk.noCurrencyBalances}</p>
          ) : (
            <>
              <div className="stat-grid">
                <Stat label={t.desk.totalBusinessCapital} value={snap.totalOwnerCapital} />
                <Stat
                  label={t.desk.netWorth}
                  value={snap.totalOwnerCapital}
                  hint={t.desk.ownerCapitalIdentity}
                />
                <Stat label={t.desk.profitToday} value={snap.profitToday} />
                <Stat label={t.desk.monthlyProfit} value={snap.profitMonth} />
                <Stat label={t.desk.realizedTradingProfit} value={snap.tradingProfitMonth} />
                <Stat
                  label={t.desk.exchangeActivity}
                  value={String(snap.exchangeCountMonth)}
                  hint={t.desk.exchangesThisMonth}
                />
                <Stat label={t.desk.commissionProfit} value={snap.hawalaCommissionMonth} />
                <Stat label={t.desk.totalCash} value={snap.totalCash} />
                <Stat label={t.desk.customerFunds} value={snap.totalCustomerFunds} />
                <Stat label={t.desk.partnerPayables} value={snap.totalPartnerPayable} />
                <Stat label={t.desk.pendingHawalas} value={snap.totalPendingHawala} />
                <Stat label={t.reports.receivables} value={snap.totalPartnerReceivable} />
                <Stat label={t.reports.tradingInventory} value={snap.totalTradingInventory} />
              </div>

              <div className="section-card stack">
                <h2>{t.desk.capitalCalculation}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {t.desk.capitalCalculationFormula}
                </p>
                <div
                  className="row"
                  style={{ gap: "1rem", flexWrap: "wrap", fontFamily: "monospace" }}
                >
                  <span>{snap.totalCash}</span>
                  <span>− {snap.totalCustomerFunds}</span>
                  <span>− {snap.totalPartnerPayable}</span>
                  <span>− {snap.totalPendingHawala}</span>
                  <span>+ {snap.totalPartnerReceivable}</span>
                  <span>+ {snap.totalTradingInventory}</span>
                  <span>
                    = <strong>{snap.totalOwnerCapital}</strong>
                  </span>
                </div>
              </div>

              <div className="section-card stack">
                <h2>{t.desk.currencyBreakdown}</h2>
                <div className="stat-grid">
                  {snap.byCurrency.map((row) => (
                    <CurrencyCard
                      key={row.currencyId}
                      row={row}
                      onSelect={() => setCurrencyFilter(row.currencyCode)}
                    />
                  ))}
                </div>
                {snap.byCurrency.length === 0 ? (
                  <p className="muted">{t.desk.noCurrencyBalances}</p>
                ) : null}
              </div>

              <div className="section-card stack">
                <h2>{t.desk.capitalAnalytics}</h2>
                <CurrencyDistributionChart rows={snap.byCurrency} />
                <IncomeSourcesChart snap={snap} />
              </div>
            </>
          )}
        </>
      ) : null}

      {tab === "invest" ? (
        <div className="dash-grid">
          <form className="section-card stack" onSubmit={onCapitalMove}>
            <h2>{t.desk.addWithdrawCapital}</h2>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.desk.operation}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "INVEST" | "WITHDRAW")}
              >
                <option value="INVEST">{t.desk.addOwnerCapital}</option>
                <option value="WITHDRAW">{t.desk.withdrawCapital}</option>
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.amount}</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.currency}</span>
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {currencyOptionLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.desk.cashVaultTill}</span>
              <select value={cashWalletId} onChange={(e) => setCashWalletId(e.target.value)} required>
                {cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.reason}</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.notes}</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? t.common.posting : t.desk.postAccountingEntry}
            </button>
          </form>

          <form className="section-card stack" onSubmit={onVaultTransfer}>
            <h2>{t.desk.transferBetweenVaults}</h2>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.from}</span>
              <select value={fromWalletId} onChange={(e) => setFromWalletId(e.target.value)}>
                {cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.to}</span>
              <select value={toWalletId} onChange={(e) => setToWalletId(e.target.value)}>
                {cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.currency}</span>
              <select value={xferCurrency} onChange={(e) => setXferCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {currencyOptionLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.amount}</span>
              <input value={xferAmount} onChange={(e) => setXferAmount(e.target.value)} required />
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {t.reports.transfer}
            </button>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              For currency conversion use the Exchange module — it posts ledger entries the same way.
            </p>
          </form>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="section-card stack">
            <h2>{t.desk.capitalHistory}</h2>
          {events.length === 0 ? (
            <p className="muted">{t.desk.noCapitalHistory}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.desk.kind}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.currency}</th>
                  <th>{t.common.user}</th>
                  <th>{t.common.reason}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.valueDate.slice(0, 19)}</td>
                    <td>{ev.kind}</td>
                    <td>{ev.amount}</td>
                    <td>{ev.currencyCode}</td>
                    <td>{ev.createdByName ?? "—"}</td>
                    <td>{ev.reason || ev.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination
            page={eventsPage}
            pageSize={eventsPageSize}
            total={eventsTotal}
            busy={busy}
            onPageChange={setEventsPage}
          />
        </div>
      ) : null}
    </div>
  );
}

function CurrencyCard({
  row,
  onSelect,
}: {
  row: CapitalCurrencyBreakdown;
  onSelect?: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className="stat-card"
      onClick={onSelect}
      style={{
        textAlign: "start",
        cursor: onSelect ? "pointer" : "default",
        border: "none",
        width: "100%",
      }}
    >
      <div className="stat-label">{currencyTitle(row)}</div>
      <div className="stat-value" style={{ fontSize: "1.25rem" }}>
        {row.ownerCapital} {row.currencyCode}
        {row.currencySymbol ? ` (${row.currencySymbol})` : ""}
      </div>
      <div className="muted" style={{ fontSize: "0.8rem" }}>
        {t.desk.cashCapitalShare
          .replace("{cash}", `${row.cash} ${row.currencyCode}`)
          .replace("{percent}", row.percentOfTotal)}
      </div>
    </button>
  );
}

function CurrencyDistributionChart({ rows }: { rows: CapitalCurrencyBreakdown[] }) {
  const t = useT();
  const total = rows.reduce((s, r) => s + Math.abs(parseFloat(r.ownerCapital) || 0), 0);
  if (total < 1e-9) {
    return <p className="muted">{t.desk.currencyDistributionUnavailable}</p>;
  }
  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {t.desk.currencyDistribution}
      </div>
      {rows.map((r) => {
        const v = Math.abs(parseFloat(r.ownerCapital) || 0);
        const pct = (v / total) * 100;
        return (
          <div key={r.currencyId} className="stack" style={{ gap: "0.15rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{currencyTitle(r)}</span>
              <span className="muted">
                {r.ownerCapital} {r.currencyCode} ({pct.toFixed(1)}%)
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 99,
                background: "rgba(20,32,28,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--accent, #1f6f54)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomeSourcesChart({ snap }: { snap: OwnerCapitalSnapshot }) {
  const t = useT();
  const items = [
    { label: t.nav.trading, value: Math.abs(parseFloat(snap.tradingProfitMonth) || 0) },
    { label: t.reports.hawalaCommission, value: Math.abs(parseFloat(snap.hawalaCommissionMonth) || 0) },
  ];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total < 1e-9) {
    return <p className="muted">{t.desk.noIncomeSources}</p>;
  }
  return (
    <div className="stack" style={{ gap: "0.4rem", marginTop: "0.75rem" }}>
      <div className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {t.desk.incomeSourcesMonth}
      </div>
      {items.map((i) => {
        const pct = (i.value / total) * 100;
        return (
          <div key={i.label} className="stack" style={{ gap: "0.15rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{i.label}</span>
              <span className="muted">
                {i.value} ({pct.toFixed(0)}%)
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 99,
                background: "rgba(20,32,28,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "#3d6b8e",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
