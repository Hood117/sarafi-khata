import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getDaybookSnapshot, type DaybookSnapshot } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { todayIso } from "@desktop/lib/datetime";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { Pagination } from "@desktop/ui/pagination";
import { Stat } from "@desktop/ui/stat";
import { useT } from "@desktop/i18n";

function typeBadgeClass(type: string): string {
  switch (type) {
    case "DEPOSIT":
      return "badge badge-ok";
    case "WITHDRAWAL":
      return "badge badge-warn";
    case "EXCHANGE":
      return "badge badge-info";
    case "HAWALA":
      return "badge badge-purple";
    case "TRADE_BUY":
    case "TRADE_SELL":
      return "badge badge-trade";
    default:
      return "badge";
  }
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DaybookClock() {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <strong>{clock}</strong>;
}

export function DaybookPage() {
  const t = useT();
  const { session } = useAuth();
  const [date, setDate] = useState(todayIso);
  const [snap, setSnap] = useState<DaybookSnapshot | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const timelinePageSize = 25;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [txTypeFilter, setTxTypeFilter] = useState("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const s = await getDaybookSnapshot({
        businessDate: date,
        module: moduleFilter === "ALL" ? undefined : moduleFilter,
        txType: txTypeFilter === "ALL" ? undefined : txTypeFilter,
        search: search || undefined,
        timelinePage,
        timelinePageSize,
      });
      setSnap(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [date, moduleFilter, txTypeFilter, search, timelinePage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTimelinePage(1);
  }, [date, moduleFilter, txTypeFilter, search]);

  function exportDaybook() {
    if (!snap) return;
    downloadCsv(`daybook-${snap.businessDate}.csv`, [
      [t.dailyBook.csvSection, t.dailyBook.csvMetric, t.dailyBook.csvValue],
      [t.dailyBook.summary, t.dailyBook.totalTransactions, String(snap.dailySummary.totalTransactions)],
      [t.dailyBook.summary, t.dailyBook.cashIn, snap.dailySummary.cashIn],
      [t.dailyBook.summary, t.dailyBook.cashOut, snap.dailySummary.cashOut],
      [t.dailyBook.summary, t.dailyBook.netProfit, snap.dailySummary.netProfit],
      [t.desk.profit, t.nav.trading, snap.profit.tradingProfit],
      [t.desk.profit, t.partner.commission, snap.profit.commissionIncome],
      [t.nav.hawala, t.status.pending, String(snap.hawala.pending)],
      [t.nav.hawala, t.dailyBook.commissionEarned, snap.hawala.commissionEarned],
      ...snap.cashPosition.map((r) => [
        t.nav.cash,
        r.currencyCode,
        `open ${r.opening} / in ${r.received} / out ${r.paid} / close ${r.expectedClosing}`,
      ]),
      ...snap.timeline.map((r) => [
        t.desk.timeline,
        r.reference,
        `${r.time} ${r.transactionType} ${r.amount ?? ""} ${r.currencyCode ?? ""}`,
      ]),
    ]);
  }

  return (
    <div className="stack daybook-page">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.dailyBook}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Live day view — ledger, hawala, trading, and cash by date.
          </p>
        </div>
        <div className="row no-print" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
            {t.desk.refresh}
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            {t.desk.printPdf}
          </button>
          <button type="button" className="btn" onClick={exportDaybook} disabled={!snap}>
            {t.desk.exportCsv}
          </button>
        </div>
      </div>

      <div className="section-card row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="row" style={{ gap: "1.25rem", flexWrap: "wrap" }}>
          <label className="stack" style={{ gap: "0.15rem" }}>
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {t.desk.businessDate}
            </span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {t.desk.currentTime}
            </div>
            <DaybookClock />
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {t.desk.loggedInUser}
            </div>
            <strong>{session?.fullName ?? "—"}</strong>
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !snap ? <p className="muted">{t.common.loading}</p> : null}

      {snap ? (
        <>
          <div className="report-print-header stack" style={{ gap: "0.15rem" }}>
            <div className="brand">Saraf · Daybook</div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              {snap.businessDate} · Generated by {session?.fullName} · {new Date().toLocaleString()}
            </div>
          </div>

          {/* Daily summary */}
          <section className="stack">
            <h2 className="section-title">{t.desk.dailySummary}</h2>
            <div className="stat-grid">
              <Stat label={t.dailyBook.totalTransactions} value={snap.dailySummary.totalTransactions} />
              <Stat label={t.dailyBook.cashIn} value={snap.dailySummary.cashIn} />
              <Stat label={t.dailyBook.cashOut} value={snap.dailySummary.cashOut} />
              <Stat label={t.dailyBook.exchange} value={snap.dailySummary.exchangeTransactions} />
              <Stat label={t.nav.hawala} value={snap.dailySummary.hawalaTransactions} />
              <Stat label={t.nav.trading} value={snap.dailySummary.tradingTransactions} />
              <Stat label={t.reports.deposits} value={snap.dailySummary.customerDeposits} />
              <Stat label={t.reports.withdrawals} value={snap.dailySummary.customerWithdrawals} />
              <Stat label={t.dailyBook.todaysProfit} value={snap.dailySummary.todaysProfit} />
              <Stat label={t.dailyBook.todaysExpenses} value={snap.dailySummary.todaysExpenses} />
              <Stat label={t.dailyBook.netProfit} value={snap.dailySummary.netProfit} />
            </div>
          </section>

          {/* Alerts */}
          {snap.alerts.length > 0 ? (
            <section className="section-card stack">
              <h2>{t.desk.alerts}</h2>
              <div className="stack" style={{ gap: "0.4rem" }}>
                {snap.alerts.map((a) => (
                  <div
                    key={`${a.code}-${a.message}`}
                    className={
                      a.severity === "critical"
                        ? "badge badge-warn"
                        : a.severity === "warn"
                          ? "badge badge-warn"
                          : "badge badge-info"
                    }
                    style={{ display: "block", padding: "0.45rem 0.7rem" }}
                  >
                    <strong>{a.code}</strong> — {a.message}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="section-card">
              <h2>{t.desk.alerts}</h2>
              <p className="muted" style={{ margin: 0 }}>
                No issues requiring attention.
              </p>
            </section>
          )}

          {/* Cash position */}
          <section className="section-card stack">
            <h2>{t.desk.cashPosition}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t.common.currency}</th>
                  <th>{t.common.opening}</th>
                  <th>{t.common.received}</th>
                  <th>{t.dailyBook.paid}</th>
                  <th>{t.dailyBook.closing}</th>
                  <th>{t.common.difference}</th>
                  <th>{t.dailyBook.flag}</th>
                </tr>
              </thead>
              <tbody>
                {snap.cashPosition.map((row) => (
                  <tr
                    key={row.currencyId}
                    style={{
                      background:
                        row.flag === "SHORTAGE"
                          ? "rgba(180,40,40,0.08)"
                          : row.flag === "OVERAGE"
                            ? "rgba(180,140,20,0.1)"
                            : undefined,
                    }}
                  >
                    <td>
                      <strong>{row.currencyCode}</strong>
                    </td>
                    <td>{row.opening}</td>
                    <td>{row.received}</td>
                    <td>{row.paid}</td>
                    <td>{row.expectedClosing}</td>
                    <td>{row.difference ?? "—"}</td>
                    <td>
                      <span
                        className={
                          row.flag === "OK" ? "badge badge-ok" : "badge badge-warn"
                        }
                      >
                        {row.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Currency summary */}
          <section className="section-card stack">
            <h2>{t.dailyBook.currencySummary}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t.common.currency}</th>
                  <th>{t.common.opening}</th>
                  <th>{t.dailyBook.purchased}</th>
                  <th>{t.dailyBook.sold}</th>
                  <th>{t.dailyBook.deposited}</th>
                  <th>{t.dailyBook.withdrawn}</th>
                  <th>{t.dailyBook.transferred}</th>
                  <th>{t.dailyBook.closing}</th>
                  <th>{t.desk.inventory}</th>
                </tr>
              </thead>
              <tbody>
                {snap.currencySummary.map((row) => (
                  <tr key={row.currencyCode}>
                    <td>{row.currencyCode}</td>
                    <td>{row.openingBalance}</td>
                    <td>{row.purchased}</td>
                    <td>{row.sold}</td>
                    <td>{row.deposited}</td>
                    <td>{row.withdrawn}</td>
                    <td>{row.transferred}</td>
                    <td>{row.closingBalance}</td>
                    <td>{row.inventoryValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="dash-grid">
            <section className="section-card stack">
              <h2>{t.dailyBook.profitSummary}</h2>
              <div className="stat-grid">
                <Stat label={t.dailyBook.exchangeProfit} value={snap.profit.exchangeProfit} />
                <Stat label={t.dailyBook.tradingProfit} value={snap.profit.tradingProfit} />
                <Stat label={t.partner.commission} value={snap.profit.commissionIncome} />
                <Stat label={t.dailyBook.expenses} value={snap.profit.expenses} />
                <Stat label={t.dailyBook.netDailyProfit} value={snap.profit.netDailyProfit} />
              </div>
            </section>

            <section className="section-card stack">
              <h2>{t.dailyBook.hawalaSummary}</h2>
              <div className="stat-grid">
                <Stat label={t.dailyBook.newToday} value={snap.hawala.newHawalas} />
                <Stat label={t.status.completed} value={snap.hawala.completed} />
                <Stat label={`${t.status.pending} (${t.common.all})`} value={snap.hawala.pending} />
                <Stat label={t.status.cancelled} value={snap.hawala.cancelled} />
                <Stat label={t.status.returned} value={snap.hawala.returned} />
                <Stat label={t.dailyBook.commissionEarned} value={snap.hawala.commissionEarned} />
                <Stat label={t.dailyBook.pendingSettlement} value={snap.hawala.pendingSettlement} />
              </div>
            </section>
          </div>

          <div className="dash-grid">
            <section className="section-card stack">
              <h2>{t.dailyBook.customerActivity}</h2>
              <div className="stat-grid">
                <Stat label={t.dailyBook.newCustomers} value={snap.customers.newCustomers} />
                <Stat label={t.dailyBook.returning} value={snap.customers.returningCustomers} />
                <Stat label={t.dailyBook.topCustomer} value={snap.customers.topCustomer ?? "—"} />
                <Stat label={t.dailyBook.largestTransaction} value={snap.customers.largestTransaction ?? "—"} />
                <Stat label={t.dailyBook.highestDeposit} value={snap.customers.highestDeposit ?? "—"} />
                <Stat label={t.dailyBook.highestWithdrawal} value={snap.customers.highestWithdrawal ?? "—"} />
              </div>
            </section>

            <section className="section-card stack">
              <h2>{t.dailyBook.partnerSarafiActivity}</h2>
              <div className="stat-grid">
                <Stat label={t.dailyBook.partnerTransactions} value={snap.partners.partnerTransactions} />
                <Stat label={t.partner.commission} value={snap.partners.partnerCommission} />
                <Stat label={t.dailyBook.outstanding} value={snap.partners.outstandingSettlements} />
                <Stat label={t.dailyBook.pendingSettlements} value={snap.partners.pendingSettlements} />
                <Stat label={t.dailyBook.topPartner} value={snap.partners.topPartner ?? "—"} />
                <Stat label={t.dailyBook.largestTransfer} value={snap.partners.largestTransfer ?? "—"} />
              </div>
            </section>
          </div>

          <div className="dash-grid">
            <section className="section-card stack">
              <h2>{t.dailyBook.tradingSummary}</h2>
              <div className="stat-grid">
                <Stat label={t.desk.purchases} value={snap.trading.purchases} />
                <Stat label={t.desk.sales} value={snap.trading.sales} />
                <Stat label={t.dailyBook.tradingProfit} value={snap.trading.tradingProfit} />
                <Stat label={t.dailyBook.openPositions} value={snap.trading.openPositions} />
                <Stat label={t.dailyBook.closedSells} value={snap.trading.closedPositions} />
                <Stat label={t.dailyBook.bestCurrency} value={snap.trading.bestCurrency ?? "—"} />
                <Stat label={t.dailyBook.worstCurrency} value={snap.trading.worstCurrency ?? "—"} />
              </div>
            </section>

            <section className="section-card stack">
              <h2>{t.dailyBook.expenseSummary}</h2>
              <div className="stat-grid">
                <Stat label={t.dailyBook.rent} value={snap.expenses.rent} />
                <Stat label={t.desk.salary} value={snap.expenses.salary} />
                <Stat label={t.dailyBook.utilities} value={snap.expenses.utilities} />
                <Stat label={t.dailyBook.transport} value={snap.expenses.transport} />
                <Stat label={t.dailyBook.office} value={snap.expenses.office} />
                <Stat label={t.desk.other} value={snap.expenses.other} />
                <Stat label={t.dailyBook.totalExpenses} value={snap.expenses.total} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Expenses post to SYSTEM wallets named Rent / Salary / Utilities / Transport / Office /
                Expense. Otherwise totals stay zero.
              </p>
            </section>
          </div>

          {/* Timeline */}
          <section className="section-card stack">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>{t.dailyBook.transactionsTimeline}</h2>
              <div className="row no-print" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                  <option value="ALL">{t.audit.allModules}</option>
                  <option value="movements">{t.dailyBook.cashMovements}</option>
                  <option value="vault">{t.desk.vault}</option>
                  <option value="exchange">{t.nav.exchange}</option>
                  <option value="hawala">{t.nav.hawala}</option>
                  <option value="trading">{t.nav.trading}</option>
                  <option value="accounting">{t.dailyBook.accounting}</option>
                </select>
                <select value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)}>
                  <option value="ALL">{t.common.allTypes}</option>
                  {[
                    "DEPOSIT",
                    "WITHDRAWAL",
                    "TRANSFER",
                    "EXCHANGE",
                    "HAWALA",
                    "TRADE_BUY",
                    "TRADE_SELL",
                    "ADJUSTMENT",
                  ].map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </select>
                <input
                  placeholder={t.common.search}
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                />
              </div>
            </div>
            {snap.timeline.length === 0 ? (
              <p className="muted">No transactions for this day.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t.common.time}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.audit.module}</th>
                    <th>{t.common.type}</th>
                    <th>{t.common.customer}</th>
                    <th>{t.common.partner}</th>
                    <th>{t.common.currency}</th>
                    <th>{t.common.amount}</th>
                    <th>{t.common.user}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.timeline.map((row) => (
                    <tr key={row.id}>
                      <td>{row.time}</td>
                      <td>
                        {row.detailPath ? (
                          <Link to={row.detailPath}>{row.reference}</Link>
                        ) : (
                          row.reference
                        )}
                      </td>
                      <td>{row.module}</td>
                      <td>
                        <span className={typeBadgeClass(row.transactionType)}>
                          {row.transactionType}
                        </span>
                      </td>
                      <td>{row.customerName ?? "—"}</td>
                      <td>{row.partnerName ?? "—"}</td>
                      <td>{row.currencyCode ?? "—"}</td>
                      <td>{row.amount ?? "—"}</td>
                      <td>{row.userName ?? "—"}</td>
                      <td>{statusLabel(t, row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pagination
              page={snap.timelinePage || timelinePage}
              pageSize={snap.timelinePageSize || timelinePageSize}
              total={snap.timelineTotal ?? snap.timeline.length}
              busy={busy}
              onPageChange={setTimelinePage}
            />
          </section>

          {/* Cash position closing */}
          <section className="section-card stack">
            <h2>{t.desk.expectedCash}</h2>
            <p className="muted" style={{ margin: 0 }}>
              Closing cash expected from ledger activity for this date.
            </p>
            <div className="stat-grid">
              {snap.cashPosition.map((row) => (
                <Stat
                  key={row.currencyId}
                  label={`${row.currencyCode} ${t.common.expected}`}
                  value={row.expectedClosing}
                  hint={`Open ${row.opening} · In ${row.received} · Out ${row.paid}`}
                />
              ))}
            </div>
          </section>

          <div
            className="row"
            style={{
              marginTop: "1rem",
              justifyContent: "space-between",
              gap: "2rem",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                minWidth: "12rem",
                borderTop: "1px solid rgba(0,0,0,0.25)",
                paddingTop: "0.35rem",
              }}
            >
              {t.users.cashier}
            </div>
            <div
              style={{
                minWidth: "12rem",
                borderTop: "1px solid rgba(0,0,0,0.25)",
                paddingTop: "0.35rem",
              }}
            >
              {t.users.manager}
            </div>
            <div className="muted" style={{ fontSize: "0.75rem", alignSelf: "flex-end" }}>
              {t.common.page.replace("{page}", "1")}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
