import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  listTransactionsPage,
  type TransactionListPage,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";

export function TransactionsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const initialQ = params.get("q")?.trim() ?? "";
  const [pageData, setPageData] = useState<TransactionListPage | null>(null);
  const [searchDraft, setSearchDraft] = useState(initialQ);
  const [search, setSearch] = useState(initialQ);
  const [txType, setTxType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = params.get("q")?.trim() ?? "";
    setSearchDraft(q);
    setSearch(q);
    setPage(1);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listTransactionsPage({
      page,
      pageSize: 25,
      txType: txType === "ALL" ? undefined : txType,
      search: search.trim() || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setPageData(result);
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
  }, [page, search, txType]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  const totalPages = pageData
    ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize))
    : 1;

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.transactions}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.common.ledgerEntries}
        </p>
      </div>

      <div className="card stack">
        <form className="row" onSubmit={handleSearch}>
          <label style={{ flex: 1, minWidth: 200 }}>
            {t.common.search}
            <input
              value={searchDraft}
              placeholder={t.common.search}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </label>
          <label>
            {t.common.type}
            <select
              value={txType}
              onChange={(e) => {
                setPage(1);
                setTxType(e.target.value);
              }}
            >
              {[
                "ALL",
                "DEPOSIT",
                "WITHDRAWAL",
                "TRANSFER",
                "EXCHANGE",
                "HAWALA",
                "ADJUSTMENT",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} style={{ alignSelf: "end" }}>
            {t.common.search}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {busy && !pageData ? <p className="muted">{t.common.loading}</p> : null}
        {pageData ? (
          <>
            <p className="muted">
              {t.common.showing} {pageData.items.length} {t.common.of} {pageData.total} (
              {pageData.page}/{totalPages})
            </p>
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.common.reference}</th>
                  <th>{t.common.type}</th>
                  <th>{t.common.customer}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      {t.transactions.emptyTitle}
                    </td>
                  </tr>
                ) : (
                  pageData.items.map((tx) => (
                    <tr key={tx.id}>
                      <td>{String(tx.valueDate).slice(0, 10)}</td>
                      <td>{tx.reference}</td>
                      <td>{tx.type}</td>
                      <td>{tx.customerName ?? "—"}</td>
                      <td>
                        <strong>{tx.amountSummary || "—"}</strong>
                      </td>
                      <td>{statusLabel(t, tx.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="row">
              <button
                type="button"
                className="secondary"
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          </>
        ) : null}
      </div>
    </div>
  );
}
