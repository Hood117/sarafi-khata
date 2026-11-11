import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOwnerCapitalSnapshot,
  listCurrenciesPage,
  type CapitalCurrencyBreakdown,
  type CurrencyListItem,
  type OwnerCapitalSnapshot,
} from "@desktop/api";
import { useLocale, useT } from "@desktop/i18n";
import { formatCurrencyLabel, moneyToneClass } from "@desktop/lib/currency-labels";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { errorMessage, todayIso } from "@desktop/lib/datetime";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import { parseSignedAmountNumber } from "@desktop/lib/western-digits";
import { PageLoadError } from "@desktop/ui/page-load-error";
import type { AppLocale } from "@/lib/i18n/locale";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
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
  const n = parseSignedAmountNumber(s);
  return Number.isFinite(n) ? n : 0;
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
  const n = parseSignedAmountNumber(raw);
  if (!Number.isFinite(n) || n === 0) return raw;
  return `−${raw}`;
}

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

  useDeskDataRefresh(() => {
    void load();
  });

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
    <div className="stack page-column capital-page workspace-page">
      {error ? <PageLoadError message={error} onRetry={() => void load()} /> : null}
      {busy && !snap ? <p className="muted">{t.common.loading}</p> : null}

      {snap ? (
        <>
          <section className="panel records-panel">
            <div className="records-chrome">
              <div className="records-title">
                <div>
                  <h2>{t.nav.ownerCapital}</h2>
                </div>
              </div>
              <div className="table-toolbar">
                <div className="table-filters" style={{ flex: 1 }}>
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
                  <label>
                    <span className="muted">{t.desk.asOfDate}</span>
                    <input
                      type="date"
                      value={asOfDate}
                      max={today}
                      onChange={(e) => setAsOfDate(e.target.value || today)}
                    />
                  </label>
                </div>
              </div>
            </div>

            {!focusRow ? (
              <p className="muted" style={{ margin: 0, padding: "12px" }}>
                {t.desk.noCurrencyBalances}
              </p>
            ) : (
              <div style={{ padding: "12px" }} className="stack">
                <h3 className="section-title" style={{ margin: 0 }}>
                  {currencyTitle(focusRow, locale)} · {t.desk.capitalOwnershipRecon}
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
                  <div className="capital-recon-row capital-recon-row-vault">
                    <dt>{t.desk.capitalActualVault}</dt>
                    <dd className={moneyToneClass(focusRow.mainVaultCash)}>
                      {focusRow.mainVaultCash} {focusRow.currencyCode}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>

          {comparing && snapNow ? (
            <section className="panel records-panel">
              <div className="records-chrome">
                <div className="records-title">
                  <div>
                    <h2>
                      {t.desk.capitalThen} ({asOfDate}) → {t.desk.capitalNow} ({today})
                    </h2>
                  </div>
                </div>
              </div>
              <div style={{ padding: "12px" }}>
                <div className="stat-grid hawala-kpi-strip">
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
            </section>
          ) : null}

          <section className="panel records-panel">
            <div className="records-chrome">
              <div className="records-title">
                <div>
                  <h2>{t.desk.capitalAnalytics}</h2>
                </div>
              </div>
            </div>
            <div style={{ padding: "12px" }} className="stack">
              <CurrencyDistributionChart rows={snap.byCurrency} />
              <IncomeSourcesChart snap={snap} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function CurrencyDistributionChart({ rows }: { rows: CapitalCurrencyBreakdown[] }) {
  const t = useT();
  const { locale } = useLocale();
  const total = rows.reduce((s, r) => s + Math.abs(parseAmt(r.ownerCapital)), 0);
  if (total < 1e-9) {
    return <p className="muted">{t.desk.currencyDistributionUnavailable}</p>;
  }
  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {t.desk.currencyDistribution}
      </div>
      {rows.map((r) => {
        const v = Math.abs(parseAmt(r.ownerCapital));
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
    { label: t.nav.trading, value: Math.abs(parseAmt(snap.tradingProfitMonth)) },
    { label: t.desk.commissionProfit, value: Math.abs(parseAmt(snap.hawalaCommissionMonth)) },
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
