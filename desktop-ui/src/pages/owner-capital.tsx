import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOwnerCapitalSnapshot,
  listCurrenciesPage,
  type CapitalCurrencyBreakdown,
  type CurrencyListItem,
  type OwnerCapitalSnapshot,
} from "@desktop/api";
import { IconDashboard } from "@desktop/icons";
import { useLocale, useT } from "@desktop/i18n";
import { formatCurrencyLabel, moneyToneClass } from "@desktop/lib/currency-labels";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { errorMessage, todayIso } from "@desktop/lib/datetime";
import { PageLoadError } from "@desktop/ui/page-load-error";
import type { AppLocale } from "@/lib/i18n/locale";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { Modal } from "@desktop/ui/modal";
import { Stat } from "@desktop/ui/stat";

function currencyTitle(row: CapitalCurrencyBreakdown, locale: AppLocale) {
  return formatCurrencyLabel(
    {
      code: row.currencyCode,
      name: row.currencyName || row.currencyCode,
      symbol: row.currencySymbol,
    },
    locale,
  );
}

function parseAmt(s: string): number {
  return Number.parseFloat(String(s).replace(/,/g, "")) || 0;
}

function formatAmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

/** Display-only minus for amounts customers owe Sarafi (does not change totals). */
function formatCustomersOweDisplay(amount: string): string {
  const raw = String(amount ?? "").trim();
  if (!raw) return "0";
  if (raw.startsWith("-") || raw.startsWith("−")) return raw;
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0) return raw;
  return `−${raw}`;
}

type CapitalView = "dashboard" | "ownership" | "money";

export function OwnerCapitalPage() {
  const t = useT();
  const { locale } = useLocale();
  const today = todayIso();
  const [asOfDate, setAsOfDate] = useState(today);
  const [snap, setSnap] = useState<OwnerCapitalSnapshot | null>(null);
  const [snapNow, setSnapNow] = useState<OwnerCapitalSnapshot | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [focusCurrency, setFocusCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownRow, setBreakdownRow] = useState<CapitalCurrencyBreakdown | null>(null);
  const [view, setView] = useState<CapitalView>("dashboard");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const comparing = asOfDate !== today;
      const [s, nowSnap, c] = await Promise.all([
        getOwnerCapitalSnapshot({ asOf: asOfDate }),
        comparing ? getOwnerCapitalSnapshot({ asOf: today }) : Promise.resolve(null),
        listCurrenciesPage({ page: 1, pageSize: 200 }),
      ]);
      setSnap(s);
      setSnapNow(comparing ? nowSnap : s);
      setCurrencies(c.items);
      setFocusCurrency((prev) => {
        if (prev && s.byCurrency.some((r) => r.currencyCode === prev)) return prev;
        const afn = s.byCurrency.find((r) => {
          const code = r.currencyCode.trim().toUpperCase();
          return code === "AFN" || code === "AF";
        });
        if (afn) return afn.currencyCode;
        return s.byCurrency[0]?.currencyCode || pickDefaultCurrency(c.items);
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setBusy(false);
    }
  }, [asOfDate, today, t.errors.loadGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  const comparing = asOfDate !== today;

  const focusRow = useMemo(() => {
    if (!snap || !focusCurrency) return null;
    return snap.byCurrency.find((r) => r.currencyCode === focusCurrency) ?? null;
  }, [snap, focusCurrency]);

  const currencyOptions = useMemo(() => {
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
    return [...map.values()].sort((a, b) => {
      const rank = (code: string) => {
        const u = code.trim().toUpperCase();
        return u === "AFN" || u === "AF" ? 0 : 1;
      };
      const ra = rank(a.code);
      const rb = rank(b.code);
      if (ra !== rb) return ra - rb;
      return a.code.localeCompare(b.code);
    });
  }, [currencies, snap]);

  const compareRows = useMemo(() => {
    if (!snap || !snapNow || !comparing) return [];
    const codes = new Set<string>();
    for (const r of snap.byCurrency) codes.add(r.currencyCode);
    for (const r of snapNow.byCurrency) codes.add(r.currencyCode);
    return [...codes]
      .sort((a, b) => a.localeCompare(b))
      .map((code) => {
        const then = snap.byCurrency.find((r) => r.currencyCode === code);
        const now = snapNow.byCurrency.find((r) => r.currencyCode === code);
        const thenAmt = parseAmt(then?.ownerCapital ?? "0");
        const nowAmt = parseAmt(now?.ownerCapital ?? "0");
        return {
          currencyCode: code,
          then: then?.ownerCapital ?? "0",
          now: now?.ownerCapital ?? "0",
          change: formatAmt(nowAmt - thenAmt),
          changeNum: nowAmt - thenAmt,
        };
      });
  }, [snap, snapNow, comparing]);

  return (
    <div className="stack">
      <div className="nav-row" role="tablist" aria-label={t.pages.ownerCapital}>
        <button
          type="button"
          role="tab"
          aria-selected={view === "dashboard"}
          className={view === "dashboard" ? "nav-link active" : "nav-link"}
          onClick={() => setView("dashboard")}
        >
          <span className="nav-link-icon">
            <IconDashboard />
          </span>
          <span className="nav-link-label">{t.nav.dashboard}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "ownership"}
          className={view === "ownership" ? "nav-link active" : "nav-link"}
          onClick={() => setView("ownership")}
        >
          <span className="nav-link-label">{t.desk.capitalOwnershipRecon}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "money"}
          className={view === "money" ? "nav-link active" : "nav-link"}
          onClick={() => setView("money")}
        >
          <span className="nav-link-label">{t.desk.capitalMoneyByCurrency}</span>
        </button>
      </div>

      {error ? <PageLoadError message={error} onRetry={() => void load()} /> : null}
      {busy && !snap ? <p className="muted">{t.common.loading}</p> : null}

      {snap ? (
        <>
          <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
            {view === "dashboard" ? (
              <div style={{ minWidth: "16rem", flex: "1 1 16rem", maxWidth: "24rem" }}>
                <CurrencyPicker
                  label={t.desk.capitalSelectCurrency}
                  currencies={currencyOptions}
                  value={focusCurrency}
                  onChange={setFocusCurrency}
                  emptyLabel={t.common.select}
                  searchPlaceholder={t.common.search}
                />
              </div>
            ) : null}
            <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
              <span className="muted">{t.desk.asOfDate}</span>
              <input
                type="date"
                value={asOfDate}
                max={today}
                onChange={(e) => setAsOfDate(e.target.value || today)}
              />
            </label>
          </div>

          {view === "dashboard" ? (
            <>
              {!focusRow ? (
                <p className="muted">{t.desk.noCurrencyBalances}</p>
              ) : (
                <div className="section-card stack">
                  <div>
                    <h2 style={{ margin: "0 0 0.25rem" }}>{currencyTitle(focusRow, locale)}</h2>
                  </div>

                  <div className="section-card stack" style={{ margin: 0 }}>
                    <h3 className="section-title" style={{ margin: 0 }}>
                      {t.desk.capitalOwnershipRecon}
                    </h3>
                    <dl className="capital-recon-list">
                      <div className="capital-recon-row">
                        <dt>{t.desk.capitalOwnerClaim}</dt>
                        <dd className={moneyToneClass(focusRow.ownerCapital)}>
                          {focusRow.ownerCapital} {focusRow.currencyCode}
                        </dd>
                      </div>
                      <div className="capital-recon-row">
                        <dt>{t.desk.capitalCustomersHeld}</dt>
                        <dd className="money-in">
                          {focusRow.customerFunds} {focusRow.currencyCode}
                        </dd>
                      </div>
                      <div className="capital-recon-row">
                        <dt>{t.desk.capitalCustomersOweSarafi}</dt>
                        <dd className="money-out">
                          {formatCustomersOweDisplay(focusRow.customerOwes)} {focusRow.currencyCode}
                        </dd>
                      </div>
                      <div className="capital-recon-row">
                        <dt>{t.desk.capitalPartnersOwed}</dt>
                        <dd className="money-out">
                          {focusRow.partnerPayable} {focusRow.currencyCode}
                        </dd>
                      </div>
                      <div className="capital-recon-row">
                        <dt>{t.desk.capitalPartnersOweSarafi}</dt>
                        <dd className="money-in">
                          {focusRow.partnerReceivable} {focusRow.currencyCode}
                        </dd>
                      </div>
                      <div className="capital-recon-row capital-recon-row-vault">
                        <dt>{t.desk.capitalActualVault}</dt>
                        <dd className={moneyToneClass(focusRow.mainVaultCash)}>
                          {focusRow.mainVaultCash} {focusRow.currencyCode}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {comparing && snapNow ? (
                <div className="section-card stack">
                  <h2 style={{ margin: 0 }}>
                    {t.desk.capitalThen} ({asOfDate}) → {t.desk.capitalNow} ({today})
                  </h2>
                  <div className="stat-grid">
                    {compareRows.map((r) => (
                      <Stat
                        key={r.currencyCode}
                        label={r.currencyCode}
                        value={`${r.then} → ${r.now}`}
                        hint={`${t.desk.capitalChange}: ${r.changeNum >= 0 ? "+" : ""}${r.change}`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="section-card stack">
                <h2>{t.desk.capitalAnalytics}</h2>
                <CurrencyDistributionChart rows={snap.byCurrency} />
                <IncomeSourcesChart snap={snap} />
              </div>
            </>
          ) : null}

          {view === "money" ? (
            <div className="section-card stack">
              <h2 style={{ margin: 0 }}>{t.desk.capitalMoneyByCurrency}</h2>
              {snap.byCurrency.length === 0 ? (
                <p className="muted">{t.desk.noCurrencyBalances}</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t.common.currency}</th>
                        <th>{t.desk.capitalDeposited}</th>
                        <th>{t.desk.capitalWithdrawn}</th>
                        <th>{t.desk.capitalCashIHave}</th>
                        <th>{t.desk.capitalIOwe}</th>
                        <th>{t.desk.capitalPeopleOweMe}</th>
                        <th>{t.desk.capitalNetPosition}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.byCurrency.map((row) => (
                        <tr
                          key={row.currencyId}
                          className="customer-row-clickable"
                          tabIndex={0}
                          role="button"
                          onClick={() => {
                            setFocusCurrency(row.currencyCode);
                            setView("dashboard");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFocusCurrency(row.currencyCode);
                              setView("dashboard");
                            }
                          }}
                        >
                          <td>
                            <strong>{row.currencyCode}</strong>
                            {row.currencySymbol ? (
                              <span className="muted"> {row.currencySymbol}</span>
                            ) : null}
                          </td>
                          <td className="money-in">
                            {row.ownerInvested} {row.currencyCode}
                          </td>
                          <td className="money-out">
                            {row.ownerWithdrawn} {row.currencyCode}
                          </td>
                          <td className={moneyToneClass(row.cash)}>
                            {row.cash} {row.currencyCode}
                          </td>
                          <td className="money-out">
                            {row.iOwe} {row.currencyCode}
                          </td>
                          <td className="money-in">
                            {row.peopleOweMe} {row.currencyCode}
                          </td>
                          <td className={moneyToneClass(row.ownerCapital)}>
                            <strong>
                              {row.ownerCapital} {row.currencyCode}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>{t.common.total}</th>
                        <th className="money-in">{snap.totalOwnerInvested}</th>
                        <th className="money-out">{snap.totalOwnerWithdrawn}</th>
                        <th className={moneyToneClass(snap.totalCash)}>{snap.totalCash}</th>
                        <th className="money-out">{snap.totalIOwe}</th>
                        <th className="money-in">{snap.totalPeopleOweMe}</th>
                        <th className={moneyToneClass(snap.totalOwnerCapital)}>
                          <strong>{snap.totalOwnerCapital}</strong>
                        </th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {view === "ownership" ? (
            <div className="section-card stack">
              <h2 style={{ margin: 0 }}>{t.desk.capitalOwnershipRecon}</h2>
              {snap.byCurrency.length === 0 ? (
                <p className="muted">{t.desk.noCurrencyBalances}</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t.common.currency}</th>
                        <th>{t.desk.capitalOwnerClaim}</th>
                        <th>{t.desk.capitalCustomersHeld}</th>
                        <th>{t.desk.capitalCustomersOweSarafi}</th>
                        <th>{t.desk.capitalPartnersOwed}</th>
                        <th>{t.desk.capitalPartnersOweSarafi}</th>
                        <th>{t.desk.capitalActualVault}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.byCurrency.map((row) => (
                        <tr
                          key={`recon-${row.currencyId}`}
                          className="customer-row-clickable"
                          tabIndex={0}
                          role="button"
                          onClick={() => {
                            setFocusCurrency(row.currencyCode);
                            setView("dashboard");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFocusCurrency(row.currencyCode);
                              setView("dashboard");
                            }
                          }}
                        >
                          <td>
                            <strong>{row.currencyCode}</strong>
                          </td>
                          <td className={moneyToneClass(row.ownerCapital)}>
                            {row.ownerCapital} {row.currencyCode}
                          </td>
                          <td className="money-in">
                            {row.customerFunds} {row.currencyCode}
                          </td>
                          <td className="money-out">
                            {formatCustomersOweDisplay(row.customerOwes)} {row.currencyCode}
                          </td>
                          <td className="money-out">
                            {row.partnerPayable} {row.currencyCode}
                          </td>
                          <td className="money-in">
                            {row.partnerReceivable} {row.currencyCode}
                          </td>
                          <td className={moneyToneClass(row.mainVaultCash)}>
                            {row.mainVaultCash} {row.currencyCode}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="row no-print" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setBreakdownRow(null);
                    setBreakdownOpen(true);
                  }}
                >
                  {t.desk.viewCapitalBreakdown}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {breakdownOpen && snap ? (
        <Modal
          title={
            breakdownRow
              ? `${t.desk.capitalBreakdownTitle} · ${breakdownRow.currencyCode}`
              : t.desk.capitalBreakdownTitle
          }
          size="wide"
          onClose={() => {
            setBreakdownOpen(false);
            setBreakdownRow(null);
          }}
        >
          <CapitalBreakdownList
            rows={
              breakdownRow
                ? breakdownRowsForCurrency(breakdownRow, t)
                : breakdownRowsForSnapshot(snap, t)
            }
            suffix={breakdownRow?.currencyCode}
          />
        </Modal>
      ) : null}
    </div>
  );
}

type BreakdownLine = {
  label: string;
  amount: string;
  tone: "in" | "out" | "auto" | "strong";
};

function breakdownRowsForSnapshot(
  snap: OwnerCapitalSnapshot,
  t: ReturnType<typeof useT>,
): BreakdownLine[] {
  return [
    { label: t.desk.capitalActualVault, amount: snap.totalCash, tone: "auto" },
    { label: t.desk.capitalCustomersHeld, amount: snap.totalCustomerFunds, tone: "in" },
    { label: t.desk.capitalCustomersOweSarafi, amount: snap.totalCustomerOwes, tone: "out" },
    { label: t.desk.partnerPayables, amount: snap.totalPartnerPayable, tone: "out" },
    { label: t.desk.pendingHawalas, amount: snap.totalPendingHawala, tone: "out" },
    { label: t.reports.receivables, amount: snap.totalPartnerReceivable, tone: "in" },
    { label: t.desk.capitalDeposited, amount: snap.totalOwnerInvested, tone: "in" },
    { label: t.desk.capitalWithdrawn, amount: snap.totalOwnerWithdrawn, tone: "out" },
    { label: t.desk.capitalIOwe, amount: snap.totalIOwe, tone: "out" },
    { label: t.desk.capitalPeopleOweMe, amount: snap.totalPeopleOweMe, tone: "in" },
    { label: t.desk.capitalNetPosition, amount: snap.totalOwnerCapital, tone: "strong" },
  ];
}

function breakdownRowsForCurrency(
  row: CapitalCurrencyBreakdown,
  t: ReturnType<typeof useT>,
): BreakdownLine[] {
  return [
    { label: t.desk.capitalActualVault, amount: row.mainVaultCash, tone: "auto" },
    { label: t.desk.capitalCustomersHeld, amount: row.customerFunds, tone: "in" },
    { label: t.desk.capitalCustomersOweSarafi, amount: formatCustomersOweDisplay(row.customerOwes), tone: "out" },
    { label: t.desk.partnerPayables, amount: row.partnerPayable, tone: "out" },
    { label: t.desk.pendingHawalas, amount: row.pendingHawala, tone: "out" },
    { label: t.reports.receivables, amount: row.partnerReceivable, tone: "in" },
    { label: t.desk.capitalDeposited, amount: row.ownerInvested, tone: "in" },
    { label: t.desk.capitalWithdrawn, amount: row.ownerWithdrawn, tone: "out" },
    { label: t.desk.capitalIOwe, amount: row.iOwe, tone: "out" },
    { label: t.desk.capitalPeopleOweMe, amount: row.peopleOweMe, tone: "in" },
    { label: t.desk.capitalNetPosition, amount: row.ownerCapital, tone: "strong" },
  ];
}

function CapitalBreakdownList({
  rows,
  suffix,
}: {
  rows: BreakdownLine[];
  suffix?: string;
}) {
  return (
    <dl className="capital-recon-list">
      {rows.map((row) => {
        const cls =
          row.tone === "in"
            ? "money-in"
            : row.tone === "out"
              ? "money-out"
              : row.tone === "strong"
                ? moneyToneClass(row.amount)
                : moneyToneClass(row.amount);
        return (
          <div
            key={row.label}
            className={`capital-recon-row${row.tone === "strong" ? " capital-recon-row-strong" : ""}`}
          >
            <dt>{row.label}</dt>
            <dd className={cls}>
              {row.tone === "strong" ? <strong>{row.amount}</strong> : row.amount}
              {suffix ? ` ${suffix}` : ""}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function CurrencyDistributionChart({ rows }: { rows: CapitalCurrencyBreakdown[] }) {
  const t = useT();
  const { locale } = useLocale();
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
              <span>{currencyTitle(r, locale)}</span>
              <span className="muted">{pct.toFixed(1)}%</span>
            </div>
            <div
              style={{
                height: "0.45rem",
                borderRadius: "999px",
                background: "var(--border, #d5ddd8)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: "100%",
                  background: "var(--money-in, #1a7a45)",
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
  const sources = [
    { label: t.nav.trading, value: Math.abs(parseFloat(snap.tradingProfitMonth) || 0) },
    { label: t.desk.commissionProfit, value: Math.abs(parseFloat(snap.hawalaCommissionMonth) || 0) },
  ].filter((s) => s.value > 0);
  const total = sources.reduce((s, r) => s + r.value, 0);
  if (total < 1e-9) {
    return <p className="muted">{t.desk.noIncomeSources}</p>;
  }
  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {t.desk.incomeSourcesMonth}
      </div>
      {sources.map((s) => {
        const pct = (s.value / total) * 100;
        return (
          <div key={s.label} className="stack" style={{ gap: "0.15rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{s.label}</span>
              <span className="money-in">{formatAmt(s.value)}</span>
            </div>
            <div
              style={{
                height: "0.45rem",
                borderRadius: "999px",
                background: "var(--border, #d5ddd8)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: "100%",
                  background: "var(--money-in, #1a7a45)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
