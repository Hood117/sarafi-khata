import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  listCurrenciesPage,
  listDebtorsCreditors,
  type CurrencyListItem,
  type DebtorCreditorRow,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { Pagination } from "@desktop/ui/pagination";
import { PageLoadError } from "@desktop/ui/page-load-error";

type TabId = "debtors" | "creditors";

export function DebtorsCreditorsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("debtors");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [rows, setRows] = useState<DebtorCreditorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 200 })
      .then((p) => {
        if (!cancelled) setCurrencies(p.items);
      })
      .catch(() => {
        if (!cancelled) setCurrencies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const q = searchDraft.trim();
      if (q === search) return;
      setSearch(q);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchDraft, search]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);

    void listDebtorsCreditors({
      side: tab === "debtors" ? "DEBTORS" : "CREDITORS",
      currencyCode: currencyFilter === "ALL" ? undefined : currencyFilter,
      search: search || undefined,
      page,
      pageSize,
      includeTotals: false,
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setTotal(result.total);
        setError(null);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, t.errors.loadGeneric));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, page, currencyFilter, search, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  useDeskDataRefresh(refresh);

  function selectTab(next: TabId) {
    setPage(1);
    setTab(next);
  }

  const amountHeader =
    tab === "debtors" ? t.debtorsCreditors.amountOwed : t.debtorsCreditors.amountHeld;

  return (
    <div className="stack dc-page workspace-page">
      {error ? <PageLoadError message={error} onRetry={refresh} /> : null}
      {busy && !loaded ? <p className="muted">{t.common.loading}</p> : null}

      <section className="panel records-panel" aria-busy={busy}>
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.nav.debtorsCreditors}</h2>
              <span className="count-badge">{loaded ? total : 0}</span>
            </div>
            <div className="records-title-actions">
              <div
                className="settings-tabs currency-panel-tabs"
                role="tablist"
                aria-label={t.nav.debtorsCreditors}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "debtors"}
                  className={`settings-tab${tab === "debtors" ? " active" : ""}`}
                  onClick={() => selectTab("debtors")}
                >
                  {t.debtorsCreditors.debtors}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "creditors"}
                  className={`settings-tab${tab === "creditors" ? " active" : ""}`}
                  onClick={() => selectTab("creditors")}
                >
                  {t.debtorsCreditors.creditors}
                </button>
              </div>
            </div>
          </div>
          <div className="table-toolbar">
            <label className="search-field search-field-emphasized">
              <input
                type="search"
                className="desk-search"
                value={searchDraft}
                placeholder={t.debtorsCreditors.searchPlaceholder}
                aria-label={t.common.search}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </label>
            <div className="table-filters">
              <CurrencyFilter
                currencies={currencies}
                value={currencyFilter === "ALL" ? "" : currencyFilter}
                onChange={(code) => {
                  setPage(1);
                  setCurrencyFilter(code || "ALL");
                }}
                allLabel={t.dailyBook.allCurrencies}
                hideLabel
              />
            </div>
          </div>
        </div>

        {loaded ? (
          <>
            <div className="table-scroll">
              <table className="report-ledger daybook-journal-table">
                <thead>
                  <tr>
                    <th className="col-row">{t.debtorsCreditors.rowNo}</th>
                    <th>{t.debtorsCreditors.customerName}</th>
                    <th>{t.debtorsCreditors.accountNumber}</th>
                    <th>{t.common.currency}</th>
                    <th className="col-amount">{amountHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        {tab === "debtors"
                          ? t.debtorsCreditors.emptyDebtors
                          : t.debtorsCreditors.emptyCreditors}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr
                        key={`${row.customerId}-${row.currencyCode}`}
                        className="is-clickable customer-row-clickable"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/customers/${row.customerId}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/customers/${row.customerId}`);
                          }
                        }}
                      >
                        <td className="col-row">{(page - 1) * pageSize + idx + 1}</td>
                        <td>
                          <strong>{row.customerName}</strong>
                        </td>
                        <td className="col-ref">{row.accountCode || "—"}</td>
                        <td>
                          <CurrencyCodeWithFlag code={row.currencyCode} />
                        </td>
                        <td
                          className={`col-amount amount-emphasis ${
                            tab === "debtors" ? "money-out" : "money-in"
                          }`}
                        >
                          {row.amountDisplay}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
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
