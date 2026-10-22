import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveCustomer,
  getCustomer,
  getCustomerBalances,
  listCurrenciesPage,
  listCustomerLedger,
  restoreCustomer,
  type CurrencyListItem,
  type CustomerBalanceRow,
  type CustomerDetail,
  type CustomerLedgerRow,
} from "@desktop/api";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import {
  TransactionDetailModal,
  clickableTxRowProps,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { LedgerAmount } from "@desktop/components/ledger-amount";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import {
  localizedCurrencyName,
  moneyToneClass,
} from "@desktop/lib/currency-labels";
import { CurrencyFlag } from "@desktop/ui/currency-flag";
import {
  amountPartsFromDebitCredit,
  fmtAmountPart,
} from "@desktop/lib/format-transaction-line";
import {
  printReportSheet,
  type ExportColumn,
  type ExportRow,
} from "@desktop/lib/export-table";
import { CustomerEditForm } from "@desktop/pages/customer-forms";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { SuccessModal } from "@desktop/ui/success-modal";

type LedgerTypeFilter =
  | "ALL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER"
  | "HAWALA"
  | "EXCHANGE";
type CustomerDetailView = "money" | "history";

function parseBalanceAmount(display: string): number {
  return Number.parseFloat(
    String(display)
      .replace(/,/g, "")
      .replace(/−/g, "-")
      .trim(),
  );
}

/** Keep existing balance value; ensure Credit shows a clear + and Debit a clear -. */
function formatSignedBalanceDisplay(display: string): string {
  const trimmed = String(display).trim();
  const n = parseBalanceAmount(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  if (n > 0) {
    return trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/^\+/, "")}`;
  }
  if (n < 0) {
    return trimmed.startsWith("-") || trimmed.startsWith("−")
      ? trimmed.replace(/^−/, "-")
      : `-${trimmed}`;
  }
  return trimmed.startsWith("+") || trimmed.startsWith("-") ? trimmed : `+${trimmed}`;
}

function customerStatusLabel(
  customer: CustomerDetail,
  t: ReturnType<typeof useT>,
): string {
  if (customer.isArchived) return t.common.archived;
  if (customer.isActive) return t.common.active;
  return t.common.inactive;
}

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { locale, dir } = useLocale();
  const rtl = dir === "rtl";

  const [showEdit, setShowEdit] = useState(false);
  const [view, setView] = useState<CustomerDetailView>("money");

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [balances, setBalances] = useState<CustomerBalanceRow[]>([]);
  const [history, setHistory] = useState<CustomerLedgerRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo, setLedgerDateTo] = useState("");
  const [ledgerType, setLedgerType] = useState<LedgerTypeFilter>("ALL");
  const [ledgerCurrency, setLedgerCurrency] = useState("ALL");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const txModal = useTransactionDetailModal();
  const dealModal = useExchangeDealDetailModal();

  function openTxOrDeal(txId: string, type: string) {
    if (type.toUpperCase() === "EXCHANGE") void dealModal.open(txId);
    else void txModal.open(txId);
  }

  const loadLedger = useCallback(async () => {
    if (!id) return;
    setLedgerBusy(true);
    try {
      const hist = await listCustomerLedger({
        customerId: id,
        page: historyPage,
        pageSize: historyPageSize,
        dateFrom: ledgerDateFrom || undefined,
        dateTo: ledgerDateTo || undefined,
        txType: ledgerType === "ALL" ? undefined : ledgerType,
        currencyCode: ledgerCurrency === "ALL" ? undefined : ledgerCurrency,
      });
      setHistory(hist.items);
      setHistoryTotal(hist.total);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadCustomerHistory));
    } finally {
      setLedgerBusy(false);
    }
  }, [
    id,
    historyPage,
    ledgerDateFrom,
    ledgerDateTo,
    ledgerType,
    ledgerCurrency,
    t.errors.loadCustomerHistory,
  ]);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const [c, bals] = await Promise.all([
        getCustomer(id),
        getCustomerBalances(id),
      ]);
      setCustomer(c);
      setBalances(bals);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadCustomerHistory));
    } finally {
      setBusy(false);
    }
  }, [id, t.errors.loadCustomerHistory]);

  useEffect(() => {
    setView("money");
    setHistoryPage(1);
    setLedgerDateFrom("");
    setLedgerDateTo("");
    setLedgerType("ALL");
    setLedgerCurrency("ALL");
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => setCurrencies(page.items))
      .catch(() => setCurrencies([]));
  }, []);

  useEffect(() => {
    if (view !== "history") return;
    void loadLedger();
  }, [view, loadLedger]);

  useEffect(() => {
    const onSaved = () => {
      void load();
      if (view === "history") void loadLedger();
    };
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [load, loadLedger, view]);

  useEffect(() => {
    setHistoryPage(1);
  }, [ledgerDateFrom, ledgerDateTo, ledgerType, ledgerCurrency]);

  function ledgerTypeLabel(type: LedgerTypeFilter): string {
    switch (type) {
      case "DEPOSIT":
        return t.transactions.deposit;
      case "WITHDRAWAL":
        return t.transactions.withdrawal;
      case "TRANSFER":
        return t.reports.transfer;
      case "HAWALA":
        return t.nav.hawala;
      case "EXCHANGE":
        return t.nav.exchange;
      default:
        return t.common.allTypes;
    }
  }

  function historyPeriodLabel(): string {
    const parts: string[] = [];
    if (ledgerDateFrom || ledgerDateTo) {
      const from = ledgerDateFrom || "…";
      const to = ledgerDateTo || "…";
      parts.push(`${t.common.from} ${from} · ${t.common.to} ${to}`);
    }
    if (ledgerType !== "ALL") parts.push(ledgerTypeLabel(ledgerType));
    if (ledgerCurrency !== "ALL") parts.push(ledgerCurrency);
    return parts.length ? parts.join(" · ") : t.customers.customerHistory;
  }

  async function fetchAllFilteredHistory(): Promise<CustomerLedgerRow[]> {
    if (!id) return [];
    const pageSize = 100;
    const all: CustomerLedgerRow[] = [];
    let page = 1;
    for (;;) {
      const hist = await listCustomerLedger({
        customerId: id,
        page,
        pageSize,
        dateFrom: ledgerDateFrom || undefined,
        dateTo: ledgerDateTo || undefined,
        txType: ledgerType === "ALL" ? undefined : ledgerType,
        currencyCode: ledgerCurrency === "ALL" ? undefined : ledgerCurrency,
      });
      all.push(...hist.items);
      if (all.length >= hist.total || hist.items.length === 0) break;
      page += 1;
      if (page > 200) break;
    }
    return all;
  }

  async function printCustomerHistory() {
    if (!customer || printBusy) return;
    setPrintBusy(true);
    setError(null);
    try {
      const rowsSource = await fetchAllFilteredHistory();
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "description", header: t.common.description, kind: "description" },
        { key: "amount", header: t.common.amount, kind: "amount" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "balance", header: t.common.balance, kind: "amount" },
        { key: "reference", header: t.common.reference, kind: "ref" },
      ];
      const rows: ExportRow[] = rowsSource.map((row) => {
        const parts = amountPartsFromDebitCredit(row);
        const amountText = parts.length
          ? parts.map(fmtAmountPart).join(" · ")
          : "—";
        const tone =
          parts.some((p) => p.sign === "+") && parts.every((p) => p.sign === "+")
            ? "in"
            : parts.some((p) => p.sign === "−") &&
                parts.every((p) => p.sign === "−")
              ? "out"
              : "";
        const description =
          (row.description ?? "").trim() || row.activity || "—";
        return {
          date: row.valueDate,
          description,
          amount: amountText,
          _amountTone: tone,
          currency: row.currencyCode,
          balance: `${row.balanceAfter} ${row.currencyCode}`,
          reference: txDisplayRef(row),
        };
      });
      const codeBit = customer.code ? ` · #${customer.code}` : "";
      printReportSheet({
        columns,
        rows,
        meta: {
          title: `${t.customers.customerHistory} — ${customer.fullName}${codeBit}`,
          businessName: "ASMS",
          periodLabel: historyPeriodLabel(),
          generatedAt: new Date().toLocaleString(
            locale === "en" ? "en" : locale,
          ),
          rtl,
        },
        emptyLabel: t.common.noEntries,
      });
    } catch (err) {
      setError(errorMessage(err, t.errors.loadCustomerHistory));
    } finally {
      setPrintBusy(false);
    }
  }

  async function onArchive() {
    if (!customer) return;
    if (!window.confirm(`${t.customers.archiveCustomer} “${customer.fullName}”?`)) return;
    try {
      await archiveCustomer(customer.id);
      await load();
      setSuccessMessage(t.common.success);
    } catch (err) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    }
  }

  async function onRestore() {
    if (!customer) return;
    try {
      await restoreCustomer(customer.id);
      await load();
      setSuccessMessage(t.common.success);
    } catch (err) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    }
  }

  if (!id) {
    return (
      <div className="stack">
        <Link to="/customers">← Customers</Link>
      </div>
    );
  }

  const codeLabel = customer?.code?.trim()
    ? customer.code.trim()
    : t.customers.noCode;
  const phoneLabel = customer?.phone?.trim() || null;
  const statusLabel = customer ? customerStatusLabel(customer, t) : null;

  return (
    <div className="stack customer-detail-page page-column">
      <div className="detail-toolbar">
        <Link className="nav-link" to="/customers" style={{ padding: 0 }}>
          ← {t.nav.customers}
        </Link>
        <div className="detail-toolbar-actions">
          {customer?.isArchived ? (
            <button type="button" className="btn primary" onClick={() => void onRestore()}>
              {t.common.restore}
            </button>
          ) : customer ? (
            <>
              <button type="button" className="btn" onClick={() => setShowEdit(true)}>
                {t.customers.edit}
              </button>
              <button type="button" className="btn" data-desk-action="delete" onClick={() => void onArchive()}>
                {t.common.archive}
              </button>
            </>
          ) : null}
          <button type="button" className="btn" onClick={() => navigate("/customers")}>
            {t.common.back}
          </button>
        </div>
      </div>

      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => {
            void load();
            if (view === "history") void loadLedger();
          }}
        />
      ) : null}
      {busy && !customer ? <p className="muted">{t.common.loading}</p> : null}

      {customer ? (
        <>
          <header className="customer-detail-identity">
            <h1 className="customer-detail-name">{customer.fullName}</h1>
            <p className="customer-detail-meta muted">
              <span className="customer-detail-code">{codeLabel}</span>
              <span aria-hidden> · </span>
              <span>
                {customer.customerType?.toUpperCase() === "TEMPORARY"
                  ? t.customers.temporary
                  : t.customers.permanent}
              </span>
              {phoneLabel ? (
                <>
                  <span aria-hidden> · </span>
                  <span className="ltr-text phone-ltr" dir="ltr">
                    {phoneLabel}
                  </span>
                </>
              ) : null}
              {statusLabel ? (
                <>
                  <span aria-hidden> · </span>
                  <strong
                    className={
                      customer.isArchived
                        ? "customer-detail-status is-archived"
                        : customer.isActive
                          ? "customer-detail-status is-active"
                          : "customer-detail-status is-inactive"
                    }
                  >
                    {statusLabel}
                  </strong>
                </>
              ) : null}
            </p>
            {customer.linkedPartnerSarafiId ? (
              <p className="customer-detail-meta" style={{ marginTop: "0.35rem" }}>
                <span className="muted">{t.customers.linkedPartner}: </span>
                <Link to={`/partners/${customer.linkedPartnerSarafiId}`}>
                  {customer.linkedPartnerName ?? t.customers.viewPartnerProfile}
                </Link>
              </p>
            ) : null}
          </header>

          <div
            className="nav-row customer-detail-tabs"
            role="tablist"
            aria-label={t.customers.customerInfo}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "money"}
              className={view === "money" ? "nav-link active" : "nav-link"}
              onClick={() => setView("money")}
            >
              <span className="nav-link-label">{t.customers.money}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "history"}
              className={view === "history" ? "nav-link active" : "nav-link"}
              onClick={() => setView("history")}
            >
              <span className="nav-link-label">{t.customers.history}</span>
            </button>
          </div>

          {view === "money" ? (
            <section className="stack customer-detail-panel" aria-label={t.customers.currentBalances}>
              {balances.length === 0 ? (
                <p className="muted">{t.common.noData}</p>
              ) : (
                <table className="report-ledger daybook-journal-table customer-balance-table">
                  <thead>
                    <tr>
                      <th>{t.cash.currencyName}</th>
                      <th>{t.cash.currencyCode}</th>
                      <th className="col-amount">{t.cash.amount}</th>
                      <th>{t.customers.condition}</th>
                      <th>{t.cash.flag}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => {
                      const n = parseBalanceAmount(b.balanceDisplay);
                      const isDebit = Number.isFinite(n) && n < 0;
                      const isCredit = Number.isFinite(n) && n > 0;
                      const conditionLabel = isDebit
                        ? t.common.debit
                        : isCredit
                          ? t.common.credit
                          : t.customers.settled;
                      const amountText = formatSignedBalanceDisplay(b.balanceDisplay);
                      return (
                        <tr key={b.currencyCode}>
                          <td>{localizedCurrencyName(b.currencyCode, locale)}</td>
                          <td>{b.currencyCode}</td>
                          <td
                            className={`col-amount customer-balance-amount ${moneyToneClass(b.balanceDisplay)}`}
                          >
                            {amountText}
                          </td>
                          <td>
                            <span
                              className={
                                isDebit
                                  ? "customer-balance-condition money-out"
                                  : isCredit
                                    ? "customer-balance-condition money-in"
                                    : "customer-balance-condition muted"
                              }
                            >
                              {conditionLabel}
                            </span>
                          </td>
                          <td className="cash-flag-cell">
                            <CurrencyFlag
                              code={b.currencyCode}
                              className="cash-currency-flag"
                              size="md"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          ) : (
            <section className="stack customer-detail-panel" aria-label={t.common.ledgerEntries}>
              <div className="customer-history-toolbar no-print">
                <div className="row customer-history-filters" style={{ flexWrap: "wrap", alignItems: "end" }}>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span className="muted">{t.common.from}</span>
                    <input
                      type="date"
                      value={ledgerDateFrom}
                      max={ledgerDateTo || undefined}
                      onChange={(e) => setLedgerDateFrom(e.target.value)}
                    />
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span className="muted">{t.common.to}</span>
                    <input
                      type="date"
                      value={ledgerDateTo}
                      min={ledgerDateFrom || undefined}
                      onChange={(e) => setLedgerDateTo(e.target.value)}
                    />
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "11rem" }}>
                    <span className="muted">{t.common.filter}</span>
                    <select
                      value={ledgerType}
                      onChange={(e) => setLedgerType(e.target.value as LedgerTypeFilter)}
                    >
                      <option value="ALL">{t.common.allTypes}</option>
                      <option value="DEPOSIT">{t.transactions.deposit}</option>
                      <option value="WITHDRAWAL">{t.transactions.withdrawal}</option>
                      <option value="TRANSFER">{t.reports.transfer}</option>
                      <option value="HAWALA">{t.nav.hawala}</option>
                      <option value="EXCHANGE">{t.nav.exchange}</option>
                    </select>
                  </label>
                  <div style={{ minWidth: "11rem" }}>
                    <CurrencyFilter
                      currencies={currencies}
                      value={ledgerCurrency === "ALL" ? "" : ledgerCurrency}
                      onChange={(code) => setLedgerCurrency(code || "ALL")}
                      allLabel={t.dailyBook.allCurrencies}
                    />
                  </div>
                  {ledgerDateFrom ||
                  ledgerDateTo ||
                  ledgerType !== "ALL" ||
                  ledgerCurrency !== "ALL" ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setLedgerDateFrom("");
                        setLedgerDateTo("");
                        setLedgerType("ALL");
                        setLedgerCurrency("ALL");
                      }}
                    >
                      {t.common.clear}
                    </button>
                  ) : null}
                </div>
                <div className="report-toolbar customer-history-print">
                  <button
                    type="button"
                    className="btn"
                    disabled={printBusy || ledgerBusy}
                    onClick={() => void printCustomerHistory()}
                  >
                    {printBusy ? t.common.loading : t.common.print}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={printBusy || ledgerBusy}
                    onClick={() => void printCustomerHistory()}
                  >
                    PDF
                  </button>
                </div>
              </div>
              {ledgerBusy && history.length === 0 ? (
                <p className="muted">{t.common.loading}</p>
              ) : history.length === 0 ? (
                <p className="muted">{t.common.noEntries}</p>
              ) : (
                <table className="report-ledger daybook-journal-table">
                  <thead>
                    <tr>
                      <th>{t.common.date}</th>
                      <th className="col-description">{t.common.description}</th>
                      <th className="col-amount">{t.common.amount}</th>
                      <th>{t.common.currency}</th>
                      <th className="col-amount">{t.common.balance}</th>
                      <th>{t.common.reference}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const description =
                        (row.description ?? "").trim() || row.activity || "—";
                      return (
                        <tr
                          key={`${row.id}-${row.currencyCode}`}
                          {...clickableTxRowProps(() => void openTxOrDeal(row.id, row.type))}
                          aria-label={txDisplayRef(row)}
                        >
                          <td className="col-when">{row.valueDate}</td>
                          <td className="col-description">{description}</td>
                          <td className="col-amount">
                            <LedgerAmount parts={amountPartsFromDebitCredit(row)} />
                          </td>
                          <td>{row.currencyCode}</td>
                          <td className={`col-amount ${moneyToneClass(row.balanceAfter)}`}>
                            <span className="amount-emphasis">
                              {row.balanceAfter} {row.currencyCode}
                            </span>
                          </td>
                          <td className="col-ref">{txDisplayRef(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <Pagination
                page={historyPage}
                pageSize={historyPageSize}
                total={historyTotal}
                busy={ledgerBusy}
                onPageChange={setHistoryPage}
                label={t.customers.ledgerRecords.replace("{count}", String(historyTotal))}
              />
            </section>
          )}
        </>
      ) : null}

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

      {showEdit && customer ? (
        <Modal
          title={t.customers.editCustomerTitle.replace("{name}", customer.fullName)}
          size="wide"
          onClose={() => setShowEdit(false)}
        >
          <CustomerEditForm
            customer={customer}
            onCancel={() => setShowEdit(false)}
            onSaved={async (updated) => {
              setShowEdit(false);
              setSuccessMessage(t.customers.customerUpdated.replace("{name}", updated.fullName));
              await load();
            }}
          />
        </Modal>
      ) : null}

      {successMessage ? (
        <SuccessModal
          title={t.common.success}
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      ) : null}
    </div>
  );
}
