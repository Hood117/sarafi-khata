import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveCustomer,
  getAppInfo,
  getCustomer,
  getCustomerBalances,
  getHawala,
  getTransactionDetail,
  listCustomerLedger,
  listCustomersPage,
  restoreCustomer,
  softDeleteMovement,
  type CustomerBalanceRow,
  type CustomerDetail,
  type CustomerLedgerRow,
  type CustomerListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import {
  TransactionDetailModal,
  clickableTxRowProps,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { ExchangeFormModal } from "@desktop/components/exchange-form-modal";
import { HawalaFormModal } from "@desktop/components/hawala-form-modal";
import { OpeningBalanceFormModal, isOpeningBalanceMovement } from "@desktop/components/opening-balance-form-modal";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { SendHawalaFormModal } from "@desktop/components/send-hawala-form-modal";
import { TransferFormModal } from "@desktop/components/transfer-form-modal";
import {
  VaultCashFormModal,
  isVaultCashMovement,
  vaultCashDirectionFromTx,
  type VaultCashDirection,
} from "@desktop/components/vault-cash-form-modal";
import { WithdrawFormModal } from "@desktop/components/withdraw-form-modal";
import { useLocale, useT } from "@desktop/i18n";
import { endSubmit, errorMessage, tryBeginSubmit } from "@desktop/lib/datetime";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import {
  EMPTY_JOURNAL_FILTER_TOTALS,
  journalFilterTotals,
} from "@desktop/lib/daybook-journal-totals";
import {
  visibleLedgerLines,
  type AmountPart,
} from "@desktop/lib/format-transaction-line";
import {
  statusLabel as txStatusLabel,
  transactionTypeLabel,
} from "@desktop/lib/i18n-labels";
import {
  printTransactionReceipt,
  type TransactionReceiptLabels,
} from "@desktop/lib/print-transaction-receipt";
import { journalTxRef } from "@desktop/lib/tx-ref";
import { CurrencyFlag } from "@desktop/ui/currency-flag";
import {
  printReportSheet,
  savePdfReportSheet,
  type ExportColumn,
  type ExportRow,
} from "@desktop/lib/export-table";
import { DepositFormModal } from "@desktop/components/deposit-form-modal";
import { InlineLedgerEntryRow } from "@desktop/components/inline-ledger-entry-row";
import { isSimpleDeskHawala } from "@desktop/pages/hawala-helpers";
import { CustomerEditForm } from "@desktop/pages/customer-forms";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { SuccessModal } from "@desktop/ui/success-modal";

function isEditableCustomerMovement(type: string, reference?: string | null) {
  const upper = type.toUpperCase();
  return (
    upper === "DEPOSIT" ||
    upper === "WITHDRAWAL" ||
    upper === "TRANSFER" ||
    upper === "HAWALA" ||
    upper === "EXCHANGE" ||
    isVaultCashMovement(type, reference) ||
    isOpeningBalanceMovement(type, reference)
  );
}

type LedgerTypeFilter =
  | "ALL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER"
  | "HAWALA"
  | "EXCHANGE";

function customerStatusLabel(
  customer: CustomerDetail,
  t: ReturnType<typeof useT>,
): string {
  if (customer.isArchived) return t.common.archived;
  if (customer.isActive) return t.common.active;
  return t.common.inactive;
}

function CustomerNameSwitcher({ customer }: { customer: CustomerDetail }) {
  const t = useT();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void listCustomersPage({
        search: query.trim() || undefined,
        archiveFilter: "active",
        page: 1,
        pageSize: 10,
      })
        .then((result) => {
          if (cancelled) return;
          setItems(result.items.filter((c) => c.id !== customer.id));
          setHighlight(0);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, customer.id]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setItems([]);
  }

  function pick(id: string) {
    close();
    navigate(`/customers/${id}`);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = items[highlight];
      if (row) pick(row.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <div ref={wrapRef} className="customer-search-wrap customer-name-switcher">
      <h1
        className="customer-detail-name"
        style={open ? { visibility: "hidden" } : undefined}
      >
        <button
          type="button"
          className="customer-name-switcher-trigger"
          aria-haspopup="listbox"
          title={t.customers.searchPlaceholder}
          onClick={() => setOpen(true)}
        >
          {customer.fullName}
          <span className="customer-name-switcher-caret" aria-hidden="true">▾</span>
        </button>
      </h1>
      {open ? (
        <input
          autoFocus
          value={query}
          placeholder={customer.fullName}
          aria-label={t.customers.searchPlaceholder}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : null}
      {open ? (
        <ul className="customer-suggest" role="listbox">
          {items.length === 0 ? (
            <li className="customer-suggest-empty muted">
              {searching ? t.common.loading : t.customers.emptyFiltered}
            </li>
          ) : (
            items.map((c, idx) => (
              <li key={c.id} role="option" aria-selected={idx === highlight}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pick(c.id)}
                >
                  <span className="customer-suggest-name">{c.fullName}</span>
                  <span className="customer-suggest-meta muted">
                    {[c.code, c.fatherName, c.phone].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const t = useT();
  const { session } = useAuth();
  const { locale, dir } = useLocale();
  const rtl = dir === "rtl";

  const [showEdit, setShowEdit] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [editDepositId, setEditDepositId] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editWithdrawId, setEditWithdrawId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editTransferId, setEditTransferId] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [editExchangeId, setEditExchangeId] = useState<string | null>(null);
  const [sendHawalaOpen, setSendHawalaOpen] = useState(false);
  const [simpleHawalaOpen, setSimpleHawalaOpen] = useState(false);
  const [editHawalaId, setEditHawalaId] = useState<string | null>(null);
  const [editHawalaDirection, setEditHawalaDirection] = useState<"SEND" | "RECEIVE">("SEND");
  const [cashOpen, setCashOpen] = useState(false);
  const [editCashId, setEditCashId] = useState<string | null>(null);
  const [cashDirection, setCashDirection] = useState<VaultCashDirection>("CASH_IN");
  const [openingOpen, setOpeningOpen] = useState(false);
  const [editOpeningId, setEditOpeningId] = useState<string | null>(null);
  const [historyMenu, setHistoryMenu] = useState<{
    x: number;
    y: number;
    row: CustomerLedgerRow;
  } | null>(null);
  const deleteSubmittingRef = useRef(false);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [balances, setBalances] = useState<CustomerBalanceRow[]>([]);
  const [history, setHistory] = useState<CustomerLedgerRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotals, setHistoryTotals] = useState(EMPTY_JOURNAL_FILTER_TOTALS);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo, setLedgerDateTo] = useState("");
  const [ledgerType, setLedgerType] = useState<LedgerTypeFilter>("ALL");
  const [ledgerCurrency, setLedgerCurrency] = useState("ALL");
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const txModal = useTransactionDetailModal();
  const dealModal = useExchangeDealDetailModal();
  const currentId = useRef(id);
  currentId.current = id;

  function openTxOrDeal(txId: string, type: string) {
    if (type.toUpperCase() === "EXCHANGE") void dealModal.open(txId);
    else void txModal.open(txId);
  }

  function refreshAfterMovement() {
    window.dispatchEvent(new CustomEvent(DESK_MOVEMENT_SAVED_EVENT));
  }

  function handleEditHistoryRow(row: CustomerLedgerRow) {
    const type = row.type;
    const reference = row.reference;
    const cashDir = vaultCashDirectionFromTx(type, reference);
    if (cashDir) {
      setCashDirection(cashDir);
      setEditCashId(row.id);
      setCashOpen(true);
      return;
    }
    if (isOpeningBalanceMovement(type, reference)) {
      setEditOpeningId(row.id);
      setOpeningOpen(true);
      return;
    }
    const upper = type.toUpperCase();
    if (upper === "DEPOSIT") {
      setEditDepositId(row.id);
      setDepositOpen(true);
      return;
    }
    if (upper === "WITHDRAWAL") {
      setEditWithdrawId(row.id);
      setWithdrawOpen(true);
      return;
    }
    if (upper === "TRANSFER") {
      setEditTransferId(row.id);
      setTransferOpen(true);
      return;
    }
    if (upper === "EXCHANGE") {
      setEditExchangeId(row.id);
      setExchangeOpen(true);
      return;
    }
    if (upper === "HAWALA") {
      void (async () => {
        try {
          const detail = await getHawala(row.id);
          if (isSimpleDeskHawala(detail)) {
            setEditHawalaId(row.id);
            setEditHawalaDirection(
              detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
            );
            setSimpleHawalaOpen(true);
            return;
          }
          setEditHawalaId(row.id);
          setEditHawalaDirection(
            detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
          );
          setSendHawalaOpen(true);
        } catch {
          setEditHawalaId(row.id);
          setEditHawalaDirection("SEND");
          setSendHawalaOpen(true);
        }
      })();
      return;
    }
    openTxOrDeal(row.id, type);
  }

  async function handleDeleteHistoryRow(row: CustomerLedgerRow) {
    if (!session) return;
    const reference = journalTxRef(row) || row.reference || row.id;
    const ok = window.confirm(
      t.desk.deleteTxConfirm.replace("{reference}", reference),
    );
    if (!ok) return;
    if (!tryBeginSubmit(deleteSubmittingRef)) return;
    setError(null);
    try {
      await softDeleteMovement({
        id: row.id,
        createdById: session.userId,
      });
      refreshAfterMovement();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      endSubmit(deleteSubmittingRef);
    }
  }

  async function handlePrintHistoryRow(row: CustomerLedgerRow) {
    try {
      const [detail, appInfo] = await Promise.all([
        getTransactionDetail(row.id),
        getAppInfo(),
      ]);
      const amounts: AmountPart[] = visibleLedgerLines(detail.lines).map((l) => ({
        sign: l.direction === "DEBIT" ? ("+" as const) : ("−" as const),
        currency: l.currencyCode,
        amount: l.amount,
      }));
      const labels: TransactionReceiptLabels = {
        receiptTitle: t.transactions.receipt,
        reference: t.common.reference,
        date: t.common.date,
        time: t.desk.currentTime,
        customer: t.common.customer,
        type: t.common.type,
        amount: t.common.amount,
        currency: t.common.currency,
        description: t.common.description,
        status: t.common.status,
        thankYou: t.transactions.thankYou,
        sender: t.common.sender,
        receiver: t.common.receiver,
        cashier: t.users.cashier,
        print: t.desk.printPdf,
      };
      printTransactionReceipt({
        businessName: appInfo.name?.trim() || "Radefy Sarafi Offline",
        detail,
        amounts,
        typeLabel: transactionTypeLabel(t, detail.type),
        statusLabel: txStatusLabel(t, detail.status),
        labels,
        txLineLabels: t.txLine,
      });
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  function historyContextItems(row: CustomerLedgerRow) {
    const editable = isEditableCustomerMovement(row.type, row.reference);
    return [
      {
        id: "edit",
        label: t.common.editAction,
        tone: "edit" as const,
        icon: <Pencil size={15} aria-hidden />,
        disabled: !editable || Boolean(customer?.isArchived),
        onSelect: () => handleEditHistoryRow(row),
      },
      {
        id: "delete",
        label: t.common.delete,
        tone: "danger" as const,
        icon: <Trash2 size={15} aria-hidden />,
        disabled: !editable || Boolean(customer?.isArchived),
        onSelect: () => void handleDeleteHistoryRow(row),
      },
      {
        id: "print",
        label: t.transactions.printReceipt,
        tone: "print" as const,
        icon: <Printer size={15} aria-hidden />,
        onSelect: () => void handlePrintHistoryRow(row),
      },
    ];
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
      if (currentId.current !== id) return;
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
      if (currentId.current !== id) return;
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
    setHistoryPage(1);
    setLedgerDateFrom("");
    setLedgerDateTo("");
    setLedgerType("ALL");
    setLedgerCurrency("ALL");
    setDraftOpen(false);
    setDepositOpen(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    const onSaved = () => {
      void load();
      void loadLedger();
    };
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [load, loadLedger]);

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

  const fetchAllFilteredHistory = useCallback(async (): Promise<CustomerLedgerRow[]> => {
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
  }, [id, ledgerDateFrom, ledgerDateTo, ledgerType, ledgerCurrency]);

  const loadHistoryTotals = useCallback(async () => {
    try {
      const rows = await fetchAllFilteredHistory();
      if (currentId.current !== id) return;
      // Ledger pages are newest-first; closing needs chrono ASC (last balanceAfter wins).
      setHistoryTotals(journalFilterTotals([...rows].reverse()));
    } catch {
      setHistoryTotals(EMPTY_JOURNAL_FILTER_TOTALS);
    }
  }, [fetchAllFilteredHistory, id]);

  useEffect(() => {
    void loadHistoryTotals();
  }, [loadHistoryTotals]);

  useEffect(() => {
    const onSaved = () => {
      void loadHistoryTotals();
    };
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [loadHistoryTotals]);

  async function exportCustomerHistory(mode: "print" | "pdf") {
    if (!customer || printBusy) return;
    setPrintBusy(true);
    setError(null);
    try {
      const rowsSource = await fetchAllFilteredHistory();
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "description", header: t.common.description, kind: "description" },
        { key: "credit", header: t.common.credit, kind: "amount" },
        { key: "debit", header: t.common.debit, kind: "amount" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "balance", header: t.common.balance, kind: "amount" },
      ];
      const rows: ExportRow[] = rowsSource.map((row) => {
        const description =
          (row.description ?? "").trim() || row.activity || "—";
        return {
          date: String(row.valueDate).slice(0, 10),
          description,
          debit: row.debit || "—",
          _debitTone: "out",
          credit: row.credit || "—",
          _creditTone: "in",
          currency: row.currencyCode,
          balance: `${row.balanceAfter} ${row.currencyCode}`,
        };
      });
      const codeBit = customer.code ? ` · #${customer.code}` : "";
      const meta = {
        title: `${t.customers.customerHistory} — ${customer.fullName}${codeBit}`,
        businessName: "Radefy Sarafi Offline",
        periodLabel: historyPeriodLabel(),
        generatedAt: new Date().toLocaleString(
          locale === "en" ? "en" : locale,
        ),
        rtl,
      };
      if (mode === "pdf") {
        const path = await savePdfReportSheet({
          columns,
          rows,
          meta,
          emptyLabel: t.common.noEntries,
        });
        setSuccessMessage(path ? `PDF · ${path}` : t.common.success);
      } else {
        printReportSheet({
          columns,
          rows,
          meta,
          emptyLabel: t.common.noEntries,
        });
      }
    } catch (err) {
      setError(errorMessage(err, t.errors.loadCustomerHistory));
    } finally {
      setPrintBusy(false);
    }
  }

  async function confirmArchive() {
    if (!customer) return;
    try {
      await archiveCustomer(customer.id);
      setArchiveConfirmOpen(false);
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
    <div className="stack customer-detail-page page-column workspace-page">
      <Link className="customer-detail-back" to="/customers">
        ← {t.nav.customers}
      </Link>
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => {
            void load();
            void loadLedger();
          }}
        />
      ) : null}
      {busy && !customer ? <p className="muted">{t.common.loading}</p> : null}

      {customer ? (
        <>
          <div className="customer-detail-head">
            <div className="customer-photo-slot" aria-label={t.customers.photo}>
              {customer.photo ? (
                <img src={customer.photo} alt={customer.fullName} />
              ) : (
                <span className="muted">{t.customers.photo}</span>
              )}
            </div>
            <div className="customer-detail-title-row">
                <CustomerNameSwitcher customer={customer} />
                <p className="customer-detail-meta">
                  <span
                    className={
                      customer.customerType?.toUpperCase() === "TEMPORARY"
                        ? "customer-detail-type is-temporary"
                        : "customer-detail-type"
                    }
                  >
                    {customer.customerType?.toUpperCase() === "TEMPORARY"
                      ? t.customers.temporary
                      : t.customers.permanent}
                  </span>
                  {statusLabel ? (
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
                  ) : null}
                </p>
                <div className="customer-detail-actions">
                  {customer.isArchived ? (
                    <button type="button" className="btn" onClick={() => void onRestore()}>
                      {t.common.restore}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn customer-edit-btn" onClick={() => setShowEdit(true)}>
                        <svg
                          className="customer-edit-icon"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        {locale === "en" ? "Edit" : t.customers.edit}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        data-desk-action="delete"
                        onClick={() => setArchiveConfirmOpen(true)}
                      >
                        {t.common.archive}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <table className="customer-info-table" aria-label={t.customers.customerInfo}>
                <tbody>
                  <tr>
                    <th>{t.customers.fatherName}</th>
                    <td>{customer.fatherName?.trim() || "—"}</td>
                    <th>{t.common.phone}</th>
                    <td className="ltr-text phone-ltr" dir="ltr">
                      <span className="ltr-text phone-ltr" dir="ltr">
                        {phoneLabel || "—"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{t.common.address}</th>
                    <td>{customer.address?.trim() || "—"}</td>
                    <th>{t.customers.code}</th>
                    <td className="customer-detail-code" dir="ltr">
                      <span className="customer-detail-code ltr-text" dir="ltr">
                        {codeLabel}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{t.common.notes}</th>
                    <td colSpan={3}>{customer.notes?.trim() || "—"}</td>
                  </tr>
                  {customer.linkedPartnerSarafiId ? (
                    <tr>
                      <th>{t.customers.linkedPartner}</th>
                      <td colSpan={3}>
                        <Link to={`/partners/${customer.linkedPartnerSarafiId}`}>
                          {customer.linkedPartnerName ?? t.customers.viewPartnerProfile}
                        </Link>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            <div className="customer-detail-tools customer-history-toolbar no-print">
              <div className="customer-history-filters">
                <label>
                  <span className="visually-hidden">{t.common.from}</span>
                  <input
                    type="date"
                    aria-label={t.common.from}
                    value={ledgerDateFrom}
                    max={ledgerDateTo || undefined}
                    onChange={(e) => setLedgerDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  <span className="visually-hidden">{t.common.to}</span>
                  <input
                    type="date"
                    aria-label={t.common.to}
                    value={ledgerDateTo}
                    min={ledgerDateFrom || undefined}
                    onChange={(e) => setLedgerDateTo(e.target.value)}
                  />
                </label>
                <label>
                  <span className="visually-hidden">{t.common.filter}</span>
                  <select
                    aria-label={t.common.filter}
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
              </div>
              <div className="report-toolbar customer-history-print">
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
                <button
                  type="button"
                  className="btn"
                  disabled={printBusy || ledgerBusy}
                  onClick={() => void exportCustomerHistory("print")}
                >
                  {printBusy ? t.common.loading : t.common.print}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={printBusy || ledgerBusy}
                  onClick={() => void exportCustomerHistory("pdf")}
                >
                  PDF
                </button>
              </div>
            </div>
          </div>

            <section className="stack customer-detail-panel customer-detail-history" aria-label={t.common.ledgerEntries}>
              <div className="customer-money-row" aria-label={t.customers.currentBalances}>
                <div className="customer-money-currencies">
                  {balances.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>{t.common.noData}</p>
                  ) : (
                    balances.map((b) => (
                        <button
                          type="button"
                          key={b.currencyCode}
                          className={[
                            "customer-money-cell",
                            moneyToneClass(b.balanceDisplay),
                            ledgerCurrency === b.currencyCode ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-pressed={ledgerCurrency === b.currencyCode}
                          onClick={() =>
                            setLedgerCurrency((current) =>
                              current === b.currencyCode ? "ALL" : b.currencyCode,
                            )
                          }
                        >
                          <CurrencyFlag
                            code={b.currencyCode}
                            className="cash-currency-flag"
                            size="sm"
                          />
                          <span
                            className="customer-balance-amount"
                            dir="ltr"
                          >
                            {b.balanceDisplay}
                          </span>
                          <span className="customer-money-code">{b.currencyCode}</span>
                        </button>
                      ))
                  )}
                </div>
                {customer.isArchived ? null : (
                  <button
                    type="button"
                    className="btn customer-money-add"
                    onClick={() => {
                      setEditDepositId(null);
                      setDepositOpen(true);
                    }}
                  >
                    {t.openingKata.addCurrency}
                  </button>
                )}
              </div>
              {ledgerBusy && history.length === 0 ? (
                <p className="muted">{t.common.loading}</p>
              ) : history.length === 0 && !draftOpen ? (
                <p className="muted">{t.common.noEntries}</p>
              ) : (
                <div className="customer-history-scroll">
                  <table className="report-ledger daybook-journal-table">
                    <thead>
                      <tr>
                        <th>{t.common.date}</th>
                        <th className="col-description">{t.common.description}</th>
                        <th className="col-amount col-credit">{t.common.credit}</th>
                        <th className="col-amount col-debit">{t.common.debit}</th>
                        <th className="col-currency">{t.common.currency}</th>
                        <th className="col-amount col-balance">{t.common.balance}</th>
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
                            aria-label={description}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setHistoryMenu({ x: e.clientX, y: e.clientY, row });
                            }}
                          >
                            <td className="col-when">{String(row.valueDate).slice(0, 10)}</td>
                            <td className="col-description">{description}</td>
                            <td className={`col-amount col-credit ${row.credit ? "money-in" : ""}`}>
                              {row.credit || "—"}
                            </td>
                            <td className={`col-amount col-debit ${row.debit ? "money-out" : ""}`}>
                              {row.debit || "—"}
                            </td>
                            <td className="col-currency">
                              <span className="ledger-currency-cell">
                                <CurrencyFlag code={row.currencyCode} size="sm" />
                                {row.currencyCode}
                              </span>
                            </td>
                            <td className={`col-amount col-balance ${moneyToneClass(row.balanceAfter)}`}>
                              <span className="amount-emphasis">
                                {row.balanceAfter} {row.currencyCode}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {draftOpen ? (
                        <InlineLedgerEntryRow
                          customerId={customer.id}
                          customerName={customer.fullName}
                          balances={balances}
                          onCancel={() => setDraftOpen(false)}
                          onSaved={() => {
                            setDraftOpen(false);
                            setHistoryPage(1);
                            window.dispatchEvent(new CustomEvent(DESK_MOVEMENT_SAVED_EVENT));
                          }}
                        />
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="customer-history-pager">
                <Pagination
                  page={historyPage}
                  pageSize={historyPageSize}
                  total={historyTotal}
                  busy={ledgerBusy}
                  onPageChange={setHistoryPage}
                  label={
                    historyTotals.closing.length > 0 ? (
                      <div className="customer-history-closing-list">
                        {historyTotals.closing.map((row) => (
                          <span
                            key={row.code}
                            className={`customer-history-closing-chip ${moneyToneClass(row.amount)}`}
                          >
                            <CurrencyFlag code={row.code} size="sm" />
                            <span className="customer-history-closing-amount" dir="ltr">
                              {row.amount}
                            </span>
                            <span className="customer-history-closing-code">{row.code}</span>
                          </span>
                        ))}
                      </div>
                    ) : null
                  }
                />
                {!customer.isArchived && !draftOpen ? (
                  <button
                    type="button"
                    className="btn primary customer-ledger-fab"
                    onClick={() => setDraftOpen(true)}
                  >
                    {t.customers.addLedgerEntry}
                  </button>
                ) : null}
              </div>
            </section>
          {historyMenu ? (
            <DeskContextMenu
              x={historyMenu.x}
              y={historyMenu.y}
              items={historyContextItems(historyMenu.row)}
              onClose={() => setHistoryMenu(null)}
            />
          ) : null}

          <DepositFormModal
            open={depositOpen}
            editTransactionId={editDepositId}
            initialCustomer={
              editDepositId
                ? null
                : { id: customer.id, name: customer.fullName }
            }
            onClose={() => {
              setDepositOpen(false);
              setEditDepositId(null);
            }}
            onSaved={() => {
              setDepositOpen(false);
              setEditDepositId(null);
              refreshAfterMovement();
            }}
          />
          <WithdrawFormModal
            open={withdrawOpen}
            editTransactionId={editWithdrawId}
            onClose={() => {
              setWithdrawOpen(false);
              setEditWithdrawId(null);
            }}
            onSaved={() => {
              setWithdrawOpen(false);
              setEditWithdrawId(null);
              refreshAfterMovement();
            }}
          />
          <TransferFormModal
            open={transferOpen}
            editTransactionId={editTransferId}
            onClose={() => {
              setTransferOpen(false);
              setEditTransferId(null);
            }}
            onSaved={() => {
              setTransferOpen(false);
              setEditTransferId(null);
              refreshAfterMovement();
            }}
          />
          <ExchangeFormModal
            open={exchangeOpen}
            editTransactionId={editExchangeId}
            onClose={() => {
              setExchangeOpen(false);
              setEditExchangeId(null);
            }}
            onSaved={() => {
              setExchangeOpen(false);
              setEditExchangeId(null);
              refreshAfterMovement();
            }}
          />
          <HawalaFormModal
            open={sendHawalaOpen}
            direction={editHawalaId ? editHawalaDirection : "SEND"}
            editTransactionId={editHawalaId}
            onClose={() => {
              setSendHawalaOpen(false);
              setEditHawalaId(null);
            }}
            onSaved={() => {
              setSendHawalaOpen(false);
              setEditHawalaId(null);
              refreshAfterMovement();
            }}
          />
          <SendHawalaFormModal
            open={simpleHawalaOpen}
            direction={editHawalaDirection}
            editTransactionId={editHawalaId}
            onClose={() => {
              setSimpleHawalaOpen(false);
              setEditHawalaId(null);
            }}
            onSaved={() => {
              setSimpleHawalaOpen(false);
              setEditHawalaId(null);
              refreshAfterMovement();
            }}
          />
          <VaultCashFormModal
            open={cashOpen}
            direction={cashDirection}
            editTransactionId={editCashId}
            onClose={() => {
              setCashOpen(false);
              setEditCashId(null);
            }}
            onSaved={() => {
              setCashOpen(false);
              setEditCashId(null);
              refreshAfterMovement();
            }}
          />
          <OpeningBalanceFormModal
            open={openingOpen}
            editTransactionId={editOpeningId}
            onClose={() => {
              setOpeningOpen(false);
              setEditOpeningId(null);
            }}
            onSaved={() => {
              setOpeningOpen(false);
              setEditOpeningId(null);
              refreshAfterMovement();
            }}
          />
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

      {archiveConfirmOpen && customer ? (
        <Modal
          title={t.customers.archiveCustomer}
          onClose={() => setArchiveConfirmOpen(false)}
        >
          <p>
            {t.customers.archiveCustomer} — {customer.fullName}
          </p>
          <div className="customer-archive-confirm-actions">
            <button type="button" className="btn" onClick={() => setArchiveConfirmOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="button" className="btn danger" onClick={() => void confirmArchive()}>
              {t.common.confirm}
            </button>
          </div>
        </Modal>
      ) : null}

      {showEdit && customer ? (
        <Modal
          title={t.customers.editCustomerTitle.replace("{name}", customer.fullName)}
          size="xl"
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
