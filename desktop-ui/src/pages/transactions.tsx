import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  listTransactionsPage,
  type TransactionListPage,
} from "@desktop/api";
import {
  TransactionDetailModal,
  clickableTxRowProps,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { TransactionLine } from "@desktop/components/transaction-line";
import { LedgerAmount } from "@desktop/components/ledger-amount";
import { useT } from "@desktop/i18n";
import { amountPartsFromRow } from "@desktop/lib/format-transaction-line";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";

const TX_TYPES = [
  { value: "ALL", label: "All" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdraw" },
  { value: "EXCHANGE", label: "Exchange" },
  { value: "HAWALA", label: "Hawala" },
  { value: "TRANSFER", label: "Transfer" },
] as const;

export function TransactionsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const initialQ = params.get("q")?.trim() ?? "";
  const [pageData, setPageData] = useState<TransactionListPage | null>(null);

  const [searchInput, setSearchInput] = useState(initialQ);
  const [search, setSearch] = useState(initialQ);
  const [txType, setTxType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const txModal = useTransactionDetailModal();
  const dealModal = useExchangeDealDetailModal();

  useDeskDataRefresh(() => {
    setReloadKey((k) => k + 1);
  });

  function openTxOrDeal(id: string, type: string) {
    if (type.toUpperCase() === "EXCHANGE") void dealModal.open(id);
    else void txModal.open(id);
  }

  useEffect(() => {
    const q = params.get("q")?.trim() ?? "";
    setSearchInput(q);
    setSearch(q);
    setPage(1);
  }, [params]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listTransactionsPage({
      page,
      pageSize: 25,
      txType: txType === "ALL" ? undefined : txType,
      search: search.trim() || undefined,
      dateFrom: dateFrom.trim() || undefined,
      dateTo: dateTo.trim() || undefined,
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
  }, [page, search, txType, dateFrom, dateTo, reloadKey]);

  const totalPages = pageData
    ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize))
    : 1;

  return (
    <div className="stack transactions-page workspace-page">
      {error ? <p className="error">{error}</p> : null}
      {busy && !pageData ? <p className="muted">{t.common.loading}</p> : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.nav.transactions}</h2>
              <span className="count-badge">{pageData?.total ?? 0}</span>
            </div>
          </div>
          <div className="table-toolbar">
            <label className="search-field search-field-emphasized">
              <input
                type="search"
                className="desk-search"
                value={searchInput}
                placeholder={`${t.common.search}…`}
                aria-label={t.common.search}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </label>
            <div className="table-filters">
              <label>
                <select
                  value={txType}
                  aria-label={t.common.type}
                  title={t.common.type}
                  onChange={(e) => {
                    setPage(1);
                    setTxType(e.target.value);
                  }}
                >
                  {TX_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="date"
                  value={dateFrom}
                  aria-label={t.common.fromDate}
                  title={t.common.fromDate}
                  onChange={(e) => {
                    setPage(1);
                    setDateFrom(e.target.value);
                  }}
                />
              </label>
              <label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  aria-label={t.common.toDate}
                  title={t.common.toDate}
                  onChange={(e) => {
                    setPage(1);
                    setDateTo(e.target.value);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        {pageData ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.description}</th>
                    <th>{t.common.reference}</th>
                    <th className="col-amount">{t.common.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t.transactions.emptyTitle}
                      </td>
                    </tr>
                  ) : (
                    pageData.items.map((tx) => (
                      <tr
                        key={tx.id}
                        {...clickableTxRowProps(() => openTxOrDeal(tx.id, tx.type))}
                        aria-label={txDisplayRef(tx)}
                      >
                        <td>{String(tx.valueDate).slice(0, 10)}</td>
                        <td>
                          <TransactionLine
                            strong
                            hideAmounts
                            input={{
                              type: tx.type,
                              reference: tx.reference,
                              status: tx.status === "POSTED" ? null : tx.status,
                              customerName: tx.customerName,
                              description: tx.description,
                              amountSummary: tx.amountSummary,
                              senderName: tx.senderName,
                              receiverName: tx.receiverName,
                            }}
                          />
                        </td>
                        <td>{txDisplayRef(tx)}</td>
                        <td className="col-amount">
                          <LedgerAmount parts={amountPartsFromRow(tx)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <span>
                {t.common.showing} {pageData.items.length} {t.common.of} {pageData.total} (
                {pageData.page}/{totalPages})
              </span>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.common.previous}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t.common.next}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <TransactionDetailModal
        detail={txModal.detail}
        busy={txModal.busy}
        error={txModal.error}
        onClose={txModal.close}
      />
      <ExchangeDealDetailModal
        detail={dealModal.detail}
        busy={dealModal.busy}
        error={dealModal.error}
        onClose={dealModal.close}
      />
    </div>
  );
}
