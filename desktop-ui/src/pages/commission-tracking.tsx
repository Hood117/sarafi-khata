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
    <div className="stack commission-tracking-page workspace-page">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      <div className="stat-grid hawala-kpi-strip">
        <div className="stat-card">
          <div className="stat-label">{t.commissionTracking.totalEarned}</div>
          <div className="stat-value commission-stat-value">
            {linesByCurrency(totals, (row) => row.total)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.commissionTracking.sendCommission}</div>
          <div className="stat-value commission-stat-value">
            {linesByCurrency(totals, (row) => row.send)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.commissionTracking.receiveCommission}</div>
          <div className="stat-value commission-stat-value">
            {linesByCurrency(totals, (row) => row.receive)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.commissionTracking.transactionCount}</div>
          <div className="stat-value">{transactionCount}</div>
        </div>
      </div>

      {totals.length > 1 ? (
        <section className="panel records-panel">
          <div className="records-chrome">
            <div className="records-title">
              <div>
                <h2>{t.commissionTracking.byCurrency}</h2>
                <span className="count-badge">{totals.length}</span>
              </div>
            </div>
          </div>
          <div className="table-scroll">
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
        </section>
      ) : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.commissionTracking.title}</h2>
              <span className="count-badge">{pageData?.total ?? 0}</span>
            </div>
            <div className="records-title-actions">
              <Link className="button-link secondary" to="/hawala">
                {t.commissionTracking.backToHawala}
              </Link>
            </div>
          </div>
          <div className="table-toolbar commission-tracking-filters no-print">
            <label className="search-field search-field-emphasized">
              <input
                type="search"
                className="desk-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.commissionTracking.searchPlaceholder}
                aria-label={t.common.search}
              />
            </label>
            <div className="table-filters">
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
              <label>
                <input
                  type="date"
                  value={dateFrom}
                  aria-label={t.common.from}
                  title={t.common.from}
                  onChange={(e) => {
                    setPeriodPreset("custom");
                    setDateFrom(e.target.value);
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
                    setPeriodPreset("custom");
                    setDateTo(e.target.value);
                  }}
                />
              </label>
              <label>
                <select
                  value={direction}
                  aria-label={t.commissionTracking.hawalaType}
                  title={t.commissionTracking.hawalaType}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="SEND">{t.commissionTracking.typeSent}</option>
                  <option value="RECEIVE">{t.commissionTracking.typeReceived}</option>
                </select>
              </label>
              <CurrencyFilter
                currencies={currencies}
                value={currencyFilter}
                onChange={setCurrencyFilter}
                allLabel={t.desk.allCurrenciesFilter}
                label={t.common.currency}
                hideLabel
              />
              <button type="button" className="secondary" onClick={clearFilters}>
                {t.commissionTracking.clearFilters}
              </button>
            </div>
          </div>
        </div>
        {busy && !pageData ? (
          <p className="muted" style={{ padding: "12px 18px" }}>
            {t.common.loading}
          </p>
        ) : null}
        {pageData ? (
          <>
            <div className="table-scroll">
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
            <div className="records-pagination">
              <Pagination
                page={pageData.page}
                pageSize={pageData.pageSize}
                total={pageData.total}
                busy={busy}
                onPageChange={setPage}
              />
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
