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

  function selectTab(next: TabId) {
    setPage(1);
    setTab(next);
  }

  const amountHeader =
    tab === "debtors" ? t.debtorsCreditors.amountOwed : t.debtorsCreditors.amountHeld;

  return (
    <div className="stack dc-page workspace-page">
      <div className="row dc-toolbar">
        <div className="nav-row" role="tablist" aria-label={t.nav.debtorsCreditors}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "debtors"}
            className={tab === "debtors" ? "nav-link active" : "nav-link"}
            onClick={() => selectTab("debtors")}
          >
            <span className="nav-link-label">{t.debtorsCreditors.debtors}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "creditors"}
            className={tab === "creditors" ? "nav-link active" : "nav-link"}
            onClick={() => selectTab("creditors")}
          >
            <span className="nav-link-label">{t.debtorsCreditors.creditors}</span>
          </button>
        </div>
        <label className="stack dc-search">
          <span className="muted">{t.common.search}</span>
          <input
            type="search"
            className="desk-search"
            value={searchDraft}
            placeholder={t.debtorsCreditors.searchPlaceholder}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </label>
        <div className="dc-currency">
          <CurrencyFilter
            currencies={currencies}
            value={currencyFilter === "ALL" ? "" : currencyFilter}
            onChange={(code) => {
              setPage(1);
              setCurrencyFilter(code || "ALL");
            }}
            allLabel={t.dailyBook.allCurrencies}
          />
        </div>
      </div>

      {error ? <PageLoadError message={error} onRetry={refresh} /> : null}
      {busy && !loaded ? <p className="muted">{t.common.loading}</p> : null}

      {loaded ? (
        <div aria-busy={busy}>
          {rows.length === 0 && !busy ? (
            <p className="muted">
              {tab === "debtors"
                ? t.debtorsCreditors.emptyDebtors
                : t.debtorsCreditors.emptyCreditors}
            </p>
          ) : rows.length > 0 ? (
            <section className="section-card stack">
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
                  {rows.map((row, idx) => (
                    <tr
                      key={`${row.customerId}-${row.currencyCode}`}
                      className="is-clickable"
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
                      <td><CurrencyCodeWithFlag code={row.currencyCode} /></td>
                      <td
                        className={`col-amount amount-emphasis ${
                          tab === "debtors" ? "money-out" : "money-in"
                        }`}
                      >
                        {row.amountDisplay}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                busy={busy}
                onPageChange={setPage}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
