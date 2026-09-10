import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getHawalaCommissionTracking,
  listCurrenciesPage,
  type CurrencyListItem,
  type HawalaCommissionCurrencyTotal,
  type HawalaCommissionTrackingPage,
} from "@desktop/api";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { Pagination } from "@desktop/ui/pagination";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { useT } from "@desktop/i18n";
import {
  datePeriodRange,
  errorMessage,
  todayIso,
  type DatePeriodPreset,
} from "@desktop/lib/datetime";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import {
  formatAmountDisplay,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";

function linesByCurrency(
  totals: HawalaCommissionCurrencyTotal[],
  pick: (row: HawalaCommissionCurrencyTotal) => string,
): string {
  if (!totals.length) return "0";
  return totals
    .map((row) => `${formatAmountDisplay(pick(row))} ${row.currencyCode}`)
    .join("\n");
}

export function CommissionTrackingPage() {
  const t = useT();
  const navigate = useNavigate();
  const defaultRange = useMemo(() => datePeriodRange("today", todayIso()), []);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [pageData, setPageData] = useState<HawalaCommissionTrackingPage | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [periodPreset, setPeriodPreset] = useState<DatePeriodPreset>("today");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [direction, setDirection] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const applyPreset = useCallback((preset: Exclude<DatePeriodPreset, "custom">) => {
    const range = datePeriodRange(preset, todayIso());
    setPeriodPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    const range = datePeriodRange("today", todayIso());
    setPeriodPreset("today");
    setDateFrom(range.from);
    setDateTo(range.to);
    setDirection("ALL");
    setCurrencyFilter("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 200 })
      .then((ccy) => setCurrencies(ccy.items))
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [searchInput, search]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, direction, currencyFilter]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getHawalaCommissionTracking({
        page,
        pageSize,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        direction: direction === "ALL" ? undefined : direction,
        currencyCode: currencyFilter || undefined,
        search: search.trim() || undefined,
      });
      setPageData(result);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setBusy(false);
    }
  }, [
    currencyFilter,
    dateFrom,
    dateTo,
    direction,
    page,
    search,
    t.errors.loadGeneric,
  ]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const totals = pageData?.totals ?? [];
  const transactionCount = totals.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="stack commission-tracking-page">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="stack" style={{ gap: "0.25rem" }}>
          <h1 style={{ margin: 0 }}>{t.commissionTracking.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.commissionTracking.subtitle}
          </p>
        </div>
        <Link className="button-link secondary" to="/hawala">
          {t.commissionTracking.backToHawala}
        </Link>
      </div>

      <div className="section-card stack">
        <div className="stat-grid">
          <div className="stat-card" style={{ minHeight: "6.5rem" }}>
            <div className="stat-label">{t.commissionTracking.totalEarned}</div>
            <div className="stat-value commission-stat-value">
              {linesByCurrency(totals, (row) => row.total)}
            </div>
          </div>
          <div className="stat-card" style={{ minHeight: "6.5rem" }}>
            <div className="stat-label">{t.commissionTracking.sendCommission}</div>
            <div className="stat-value commission-stat-value">
              {linesByCurrency(totals, (row) => row.send)}
            </div>
          </div>
          <div className="stat-card" style={{ minHeight: "6.5rem" }}>
            <div className="stat-label">{t.commissionTracking.receiveCommission}</div>
            <div className="stat-value commission-stat-value">
              {linesByCurrency(totals, (row) => row.receive)}
            </div>
          </div>
          <div className="stat-card" style={{ minHeight: "6.5rem" }}>
            <div className="stat-label">{t.commissionTracking.transactionCount}</div>
            <div className="stat-value">{transactionCount}</div>
          </div>
        </div>
        {totals.length > 1 ? (
          <div className="commission-currency-breakdown">
            <h3 style={{ margin: "0 0 0.5rem" }}>{t.commissionTracking.byCurrency}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t.common.currency}</th>
                  <th>{t.commissionTracking.totalEarned}</th>
                  <th>{t.commissionTracking.sendCommission}</th>
                  <th>{t.commissionTracking.receiveCommission}</th>
                  <th>{t.commissionTracking.transactionCount}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((row) => (
                  <tr key={row.currencyCode}>
                    <td>
                      <CurrencyCodeWithFlag code={row.currencyCode} />
                    </td>
                    <td>{formatAmountDisplay(row.total)}</td>
                    <td>{formatAmountDisplay(row.send)}</td>
                    <td>{formatAmountDisplay(row.receive)}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="muted" style={{ margin: 0 }}>
          {t.commissionTracking.hint}
        </p>
      </div>

      <div className="section-card stack commission-tracking-filters no-print">
        <div
          className="report-period-presets"
          role="group"
          aria-label={t.common.filter}
        >
          {(
            [
              ["today", t.common.today],
              ["yesterday", t.common.yesterday],
              ["week", t.common.thisWeek],
              ["month", t.common.thisMonth],
              ["custom", t.common.custom],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                periodPreset === id
                  ? "report-period-preset active"
                  : "report-period-preset"
              }
              onClick={() => {
                if (id === "custom") {
                  setPeriodPreset("custom");
                  return;
                }
                applyPreset(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="commission-tracking-filter-row">
          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">{t.common.from}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPeriodPreset("custom");
                setDateFrom(e.target.value);
              }}
            />
          </label>
          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">{t.common.to}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPeriodPreset("custom");
                setDateTo(e.target.value);
              }}
            />
          </label>
          <label className="stack" style={{ gap: "0.25rem", minWidth: "9rem" }}>
            <span className="muted">{t.commissionTracking.hawalaType}</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="ALL">{t.common.all}</option>
              <option value="SEND">{t.commissionTracking.typeSent}</option>
              <option value="RECEIVE">{t.commissionTracking.typeReceived}</option>
            </select>
          </label>
          <div style={{ minWidth: "12rem" }}>
            <CurrencyFilter
              currencies={currencies}
              value={currencyFilter}
              onChange={setCurrencyFilter}
              allLabel={t.desk.allCurrenciesFilter}
              label={t.common.currency}
            />
          </div>
          <label className="stack" style={{ gap: "0.25rem", flex: "1 1 14rem" }}>
            <span className="muted">{t.common.search}</span>
            <input
              type="search"
              className="desk-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.commissionTracking.searchPlaceholder}
            />
          </label>
          <button type="button" className="secondary" onClick={clearFilters}>
            {t.commissionTracking.clearFilters}
          </button>
        </div>
      </div>

      <div className="section-card stack">
        <h2 style={{ margin: 0 }}>{t.commissionTracking.transactionsHeading}</h2>
        {busy && !pageData ? <p className="muted">{t.common.loading}</p> : null}
        {pageData ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.desk.hawalaNumber}</th>
                    <th>{t.common.type}</th>
                    <th>{t.hawala.sender}</th>
                    <th>{t.hawala.receiver}</th>
                    <th>{t.common.currency}</th>
                    <th>{t.commissionTracking.grossAmount}</th>
                    <th>{t.common.commission}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.map((row) => {
                    const sent = row.direction.toUpperCase() === "SEND";
                    return (
                      <tr
                        key={row.id}
                        className="customer-row-clickable"
                        tabIndex={0}
                        role="link"
                        aria-label={`${t.common.view} ${hawalaNumberRef(row)}`}
                        onClick={() => navigate(`/hawala/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/hawala/${row.id}`);
                          }
                        }}
                      >
                        <td>{String(row.valueDate).slice(0, 10)}</td>
                        <td>
                          <strong>{hawalaNumberRef(row)}</strong>
                        </td>
                        <td>
                          {sent
                            ? t.commissionTracking.typeSent
                            : t.commissionTracking.typeReceived}
                        </td>
                        <td>{row.senderName ?? "—"}</td>
                        <td>{row.receiverName ?? "—"}</td>
                        <td>
                          <CurrencyCodeWithFlag code={row.currencyCode} />
                        </td>
                        <td>{formatAmountDisplay(row.amount)}</td>
                        <td className="money-in">
                          {formatAmountDisplay(row.commission)}
                        </td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {statusLabel(t, row.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted">
                        {t.commissionTracking.empty}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pageData.page}
              pageSize={pageData.pageSize}
              total={pageData.total}
              busy={busy}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
