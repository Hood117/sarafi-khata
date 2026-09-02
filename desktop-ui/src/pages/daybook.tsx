import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAppInfo,
  getTransactionDetail,
  listCurrenciesPage,
  listDaybookJournal,
  softDeleteMovement,
  type CurrencyListItem,
  type DaybookJournalLine,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { DepositFormModal } from "@desktop/components/deposit-form-modal";
import { ExchangeFormModal } from "@desktop/components/exchange-form-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { HawalaFormModal } from "@desktop/components/hawala-form-modal";
import { OpeningBalanceFormModal, isOpeningBalanceMovement } from "@desktop/components/opening-balance-form-modal";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { TransactionTypeIcon } from "@desktop/components/transaction-type-icon";
import {
  TransactionDetailModal,
  clickableTxRowProps,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import { TransferFormModal } from "@desktop/components/transfer-form-modal";
import {
  VaultCashFormModal,
  isVaultCashMovement,
  vaultCashDirectionFromTx,
  type VaultCashDirection,
} from "@desktop/components/vault-cash-form-modal";
import { WithdrawFormModal } from "@desktop/components/withdraw-form-modal";
import { useLocale, useT } from "@desktop/i18n";
import {
  colorizeAmountsInText,
  descriptionToneFromJournalRow,
} from "@desktop/lib/colorize-amounts";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import { errorMessage, endSubmit, todayIso, tryBeginSubmit } from "@desktop/lib/datetime";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { PageLoadError } from "@desktop/ui/page-load-error";
import {
  exportTable,
  type ExportColumn,
  type ExportRow,
} from "@desktop/lib/export-table";
import { statusLabel, transactionTypeLabel } from "@desktop/lib/i18n-labels";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";
import {
  printTransactionReceipt,
  type TransactionReceiptLabels,
} from "@desktop/lib/print-transaction-receipt";
import {
  visibleLedgerLines,
  type AmountPart,
} from "@desktop/lib/format-transaction-line";
import { printDaybookLedger } from "@desktop/lib/print-daybook";
import { IconWhatsApp } from "@desktop/icons";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Pagination } from "@desktop/ui/pagination";

function isEditableMovement(type: string, reference?: string | null) {
  const t = type.toUpperCase();
  return (
    t === "DEPOSIT" ||
    t === "WITHDRAWAL" ||
    t === "TRANSFER" ||
    t === "HAWALA" ||
    t === "EXCHANGE" ||
    isVaultCashMovement(type, reference) ||
    isOpeningBalanceMovement(type, reference)
  );
}

function displayAccountCode(code?: string | null): string {
  return (code ?? "").trim().replace(/^#+/, "");
}

/** Opposite Account = other ledger party's account number (from postings). */
function formatOppositeAccount(line: DaybookJournalLine): string {
  const code = displayAccountCode(line.oppositeAccountCode);
  if (code) return code;
  const name = line.oppositeAccountName?.trim();
  return name || "—";
}

function journalDebitClass(line: DaybookJournalLine): string {
  if (!line.debit) return "col-amount col-debit";
  const type = line.transactionType.toUpperCase();
  if (type === "WITHDRAWAL" || type === "EXPENSE") {
    return "col-amount col-debit money-out";
  }
  return "col-amount col-debit money-in";
}

function journalCreditClass(line: DaybookJournalLine): string {
  if (!line.credit) return "col-amount col-credit";
  const type = line.transactionType.toUpperCase();
  if (type === "DEPOSIT") {
    return "col-amount col-credit money-in";
  }
  return "col-amount col-credit money-out";
}

export function DaybookPage() {
  const t = useT();
  const { locale, dir } = useLocale();
  const rtl = dir === "rtl";
  const { session } = useAuth();
  const [date, setDate] = useState(todayIso);
  const [journal, setJournal] = useState<DaybookJournalLine[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);
  const [journalLimitDraft, setJournalLimitDraft] = useState("");
  const [journalPageSize, setJournalPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [whatsappBusyId, setWhatsappBusyId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [journalMenu, setJournalMenu] = useState<{
    x: number;
    y: number;
    line: DaybookJournalLine;
  } | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [sendHawalaOpen, setSendHawalaOpen] = useState(false);
  const [editDepositId, setEditDepositId] = useState<string | null>(null);
  const [editWithdrawId, setEditWithdrawId] = useState<string | null>(null);
  const [editTransferId, setEditTransferId] = useState<string | null>(null);
  const [editExchangeId, setEditExchangeId] = useState<string | null>(null);
  const [editHawalaId, setEditHawalaId] = useState<string | null>(null);
  const [editHawalaDirection, setEditHawalaDirection] = useState<"SEND" | "RECEIVE">(
    "SEND",
  );
  const [cashOpen, setCashOpen] = useState(false);
  const [cashDirection, setCashDirection] = useState<VaultCashDirection>("CASH_IN");
  const [editCashId, setEditCashId] = useState<string | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [editOpeningId, setEditOpeningId] = useState<string | null>(null);
  const deleteSubmittingRef = useRef(false);
  const txModal = useTransactionDetailModal();
  const dealModal = useExchangeDealDetailModal();

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const journalScrollRef = useRef<HTMLDivElement>(null);
  const preferLatestPageRef = useRef(true);
  /** Stay pinned to the newest rows until the user scrolls up. */
  const stickJournalBottomRef = useRef(true);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const raw = journalLimitDraft.trim();
      if (raw === "") {
        setJournalPageSize(50);
        return;
      }
      const n = Number.parseInt(raw, 10);
      setJournalPageSize(Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 50);
    }, 300);
    return () => window.clearTimeout(id);
  }, [journalLimitDraft]);

  useEffect(() => {
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => {
        if (!cancelled) setCurrencies(page.items);
      })
      .catch(() => {
        if (!cancelled) setCurrencies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const j = await listDaybookJournal({
        businessDate: date,
        currencyCode: currencyFilter === "ALL" ? undefined : currencyFilter,
        search: search || undefined,
        page: journalPage,
        pageSize: journalPageSize,
      });
      setJournalTotal(j.total);
      if (preferLatestPageRef.current) {
        preferLatestPageRef.current = false;
        const lastPage = Math.max(1, Math.ceil(j.total / journalPageSize) || 1);
        if (lastPage !== journalPage) {
          setJournalPage(lastPage);
          setError(null);
          return;
        }
      }
      setJournal(j.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadDaybook));
    } finally {
      setBusy(false);
      setHasLoaded(true);
    }
  }, [date, currencyFilter, search, journalPage, journalPageSize, t.errors.loadDaybook]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    preferLatestPageRef.current = true;
    stickJournalBottomRef.current = true;
    setJournalPage(1);
  }, [date, currencyFilter, search, journalPageSize]);

  useEffect(() => {
    const el = journalScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickJournalBottomRef.current = gap < 56;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [journal.length > 0]);

  useEffect(() => {
    const el = journalScrollRef.current;
    if (!el || journal.length === 0 || busy) return;
    if (!stickJournalBottomRef.current) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [journal, busy]);

  useEffect(() => {
    const onSaved = () => {
      preferLatestPageRef.current = true;
      stickJournalBottomRef.current = true;
      void load();
    };
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [load]);

  function openTxOrDeal(id: string, type: string) {
    if (type.toUpperCase() === "EXCHANGE") void dealModal.open(id);
    else void txModal.open(id);
  }

  function openJournalRow(line: DaybookJournalLine) {
    openTxOrDeal(line.transactionId, line.transactionType);
  }

  function handleEditMovement(id: string, type: string, reference?: string | null) {
    const cashDir = vaultCashDirectionFromTx(type, reference);
    if (cashDir) {
      setCashDirection(cashDir);
      setEditCashId(id);
      setCashOpen(true);
      return;
    }
    if (isOpeningBalanceMovement(type, reference)) {
      setEditOpeningId(id);
      setOpeningOpen(true);
      return;
    }
    const upper = type.toUpperCase();
    if (upper === "DEPOSIT") {
      setEditDepositId(id);
      setDepositOpen(true);
      return;
    }
    if (upper === "WITHDRAWAL") {
      setEditWithdrawId(id);
      setWithdrawOpen(true);
      return;
    }
    if (upper === "TRANSFER") {
      setEditTransferId(id);
      setTransferOpen(true);
      return;
    }
    if (upper === "EXCHANGE") {
      setEditExchangeId(id);
      setExchangeOpen(true);
      return;
    }
    if (upper === "HAWALA") {
      setEditHawalaId(id);
      setEditHawalaDirection("SEND");
      setSendHawalaOpen(true);
      return;
    }
    openTxOrDeal(id, type);
  }

  async function handleDeleteMovement(id: string, reference: string) {
    if (!session) return;
    const ok = window.confirm(
      t.desk.deleteTxConfirm.replace("{reference}", reference),
    );
    if (!ok) return;
    if (!tryBeginSubmit(deleteSubmittingRef)) return;
    setError(null);
    try {
      await softDeleteMovement({
        id,
        createdById: session.userId,
      });
      void load();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      endSubmit(deleteSubmittingRef);
    }
  }

  async function handlePrintMovement(line: DaybookJournalLine) {
    try {
      const [detail, appInfo] = await Promise.all([
        getTransactionDetail(line.transactionId),
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
        businessName: appInfo.name?.trim() || "ASMS",
        detail,
        amounts,
        typeLabel: transactionTypeLabel(t, detail.type),
        statusLabel: statusLabel(t, detail.status),
        labels,
        txLineLabels: t.txLine,
      });
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  async function handleDaybookWhatsApp(transactionId: string) {
    setWhatsappBusyId(transactionId);
    setError(null);
    try {
      const result = await sendHawalaWhatsAppToPartner(
        transactionId,
        t.hawala.whatsappMessage,
      );
      if (!result.ok) {
        setError(
          result.reason === "missing_phone"
            ? t.hawala.whatsappPartnerMissingPhone
            : result.error || t.errors.loadGeneric,
        );
      }
    } finally {
      setWhatsappBusyId(null);
    }
  }

  function journalContextItems(line: DaybookJournalLine) {
    const editable = isEditableMovement(line.transactionType, line.reference);
    const isHawala = line.transactionType.toUpperCase() === "HAWALA";
    return [
      {
        id: "edit",
        label: t.common.editAction,
        disabled: !editable,
        onSelect: () =>
          handleEditMovement(line.transactionId, line.transactionType, line.reference),
      },
      {
        id: "delete",
        label: t.common.delete,
        danger: true,
        disabled: !editable,
        onSelect: () => void handleDeleteMovement(line.transactionId, txDisplayRef(line)),
      },
      {
        id: "print",
        label: t.transactions.printReceipt,
        onSelect: () => void handlePrintMovement(line),
      },
      ...(isHawala
        ? [
            {
              id: "whatsapp",
              label: t.hawala.sendWhatsApp,
              onSelect: () => {
                void (async () => {
                  const result = await sendHawalaWhatsAppToPartner(
                    line.transactionId,
                    t.hawala.whatsappMessage,
                  );
                  if (!result.ok) {
                    setError(
                      result.reason === "missing_phone"
                        ? t.hawala.whatsappPartnerMissingPhone
                        : result.error || t.errors.loadGeneric,
                    );
                  }
                })();
              },
            },
          ]
        : []),
    ];
  }

  function journalExportColumns(): ExportColumn[] {
    return [
      { key: "rowNo", header: t.dailyBook.rowNo, kind: "count" },
      { key: "valueDate", header: t.common.date, kind: "date" },
      { key: "accountCode", header: t.dailyBook.accountCode, kind: "ref" },
      { key: "accountName", header: t.dailyBook.accountName, kind: "text" },
      { key: "oppositeAccount", header: t.dailyBook.oppositeAccount, kind: "text" },
      { key: "description", header: t.common.description, kind: "description" },
      { key: "debit", header: t.dailyBook.debit, kind: "amount" },
      { key: "credit", header: t.dailyBook.credit, kind: "amount" },
      { key: "balanceAfter", header: t.common.balance, kind: "amount" },
      { key: "currencyCode", header: t.dailyBook.currencyType, kind: "text" },
      { key: "reference", header: t.common.reference, kind: "ref" },
    ];
  }

  function toExportRows(lines: DaybookJournalLine[]): ExportRow[] {
    return lines.map((r) => {
      const debitCls = journalDebitClass(r);
      const creditCls = journalCreditClass(r);
      const debitTone = debitCls.includes("money-in")
        ? "in"
        : debitCls.includes("money-out")
          ? "out"
          : "";
      const creditTone = creditCls.includes("money-in")
        ? "in"
        : creditCls.includes("money-out")
          ? "out"
          : "";
      const balTone = moneyToneClass(r.balanceAfter);
      return {
        rowNo: String(r.rowNo),
        valueDate: r.valueDate,
        accountCode: displayAccountCode(r.accountCode),
        accountName: r.accountName || "",
        oppositeAccount: formatOppositeAccount(r),
        description: r.description || "",
        debit: r.debit || "",
        credit: r.credit || "",
        balanceAfter: r.balanceAfter
          ? `${r.balanceAfter} ${r.currencyCode}`.trim()
          : "",
        currencyCode: r.currencyCode || "",
        reference: txDisplayRef(r) || "",
        _debitTone: debitTone,
        _creditTone: creditTone,
        _balanceTone: balTone.includes("money-in")
          ? "in"
          : balTone.includes("money-out")
            ? "out"
            : "",
      };
    });
  }

  async function fetchAllJournalLines(): Promise<DaybookJournalLine[]> {
    const pageSize = 100;
    let page = 1;
    let totalPages = 1;
    const all: DaybookJournalLine[] = [];
    while (page <= totalPages) {
      const j = await listDaybookJournal({
        businessDate: date,
        currencyCode: currencyFilter === "ALL" ? undefined : currencyFilter,
        search: search || undefined,
        page,
        pageSize,
      });
      all.push(...j.items);
      totalPages = Math.max(1, Math.ceil(j.total / j.pageSize) || 1);
      if (j.items.length === 0) break;
      page += 1;
    }
    return all;
  }

  async function handleExportCsv() {
    if (exportBusy) return;
    setExportBusy(true);
    setError(null);
    try {
      const lines = await fetchAllJournalLines();
      const path = await exportTable(
        `daybook-${date}`,
        journalExportColumns(),
        toExportRows(lines),
        {
          title: t.nav.dailyBook,
          businessName: "ASMS",
          periodLabel: date,
          subtitle:
            currencyFilter === "ALL"
              ? t.dailyBook.allCurrencies
              : currencyFilter,
          generatedBy: session?.fullName ?? undefined,
          generatedAt: new Date().toLocaleString(locale === "en" ? "en" : locale),
          rtl,
        },
      );
      if (path) {
        window.alert(`${t.desk.exportCsv}\n${path}`);
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handlePrintPdf() {
    if (exportBusy) return;
    setExportBusy(true);
    setError(null);
    try {
      const [lines, appInfo] = await Promise.all([
        fetchAllJournalLines(),
        getAppInfo().catch(() => null),
      ]);
      printDaybookLedger({
        columns: journalExportColumns(),
        rows: toExportRows(lines),
        meta: {
          title: t.nav.dailyBook,
          businessName: appInfo?.name?.trim() || "ASMS",
          businessDate: date,
          currencyFilter:
            currencyFilter === "ALL" ? t.dailyBook.allCurrencies : currencyFilter,
          generatedBy: session?.fullName ?? undefined,
          generatedAt: new Date().toLocaleString(),
        },
        emptyLabel: t.dailyBook.noJournalLines,
        printLabel: t.desk.printPdf,
      });
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="stack daybook-page">
      <div
        className="section-card row daybook-filters no-print"
        style={{ flexWrap: "wrap", alignItems: "end" }}
      >
        <label className="daybook-journal-date" style={{ margin: 0 }}>
          <span className="muted">{t.common.date}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              if (next) setDate(next);
            }}
            aria-label={t.common.date}
          />
        </label>
        <div style={{ margin: 0, minWidth: 160 }}>
          <CurrencyFilter
            currencies={currencies}
            value={currencyFilter === "ALL" ? "" : currencyFilter}
            onChange={(code) => setCurrencyFilter(code || "ALL")}
            allLabel={t.dailyBook.allCurrencies}
          />
        </div>
        <label style={{ margin: 0, minWidth: 200, flex: 1 }}>
          {t.common.search}
          <input
            type="search"
            className="desk-search"
            value={searchDraft}
            placeholder={t.common.search}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap", marginInlineStart: "auto" }}>
          <button
            type="button"
            className="btn"
            data-desk-action="print"
            data-desk-primary
            disabled={exportBusy}
            onClick={() => void handlePrintPdf()}
          >
            {exportBusy ? t.common.loading : t.desk.printPdf}
          </button>
          <button
            type="button"
            className="btn"
            disabled={exportBusy}
            onClick={() => void handleExportCsv()}
          >
            {t.desk.exportCsv}
          </button>
        </div>
      </div>

      {error ? <PageLoadError message={error} onRetry={() => void load()} /> : null}
      {busy && !hasLoaded ? <p className="muted">{t.common.loading}</p> : null}

      {hasLoaded ? (
        <>
          <section className="section-card stack daybook-journal-section">
              <div
                className="row no-print"
                style={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t.dailyBook.journal}
                </h2>
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  {t.dailyBook.activityRecordsHint}
                </p>
              </div>
              <div
                className="row no-print"
                style={{ flexWrap: "wrap", alignItems: "end" }}
              >
                <label style={{ margin: 0, minWidth: 140 }}>
                  {t.dailyBook.activityRecords}
                  <input
                    type="number"
                    min={1}
                    max={500}
                    inputMode="numeric"
                    placeholder={t.dailyBook.activityAllDay}
                    value={journalLimitDraft}
                    onChange={(e) => setJournalLimitDraft(e.target.value)}
                  />
                </label>
                {journalTotal > 0 ? (
                  <p className="muted" style={{ margin: 0, paddingBottom: "0.35rem" }}>
                    {t.dailyBook.activityShowing
                      .replace("{shown}", String(journal.length))
                      .replace("{total}", String(journalTotal))}
                  </p>
                ) : null}
              </div>
            </div>
            {journal.length === 0 && !busy ? (
              <p className="muted" style={{ margin: 0 }}>
                {t.dailyBook.noJournalLines}
              </p>
            ) : (
              <div className="daybook-journal-scroll table-scroll" ref={journalScrollRef}>
                <table className="report-ledger daybook-journal-table">
                  <thead>
                    <tr>
                      <th className="col-row">{t.dailyBook.rowNo}</th>
                      <th className="col-when">{t.common.date}</th>
                      <th className="col-account-code">{t.dailyBook.accountCode}</th>
                      <th>{t.dailyBook.accountName}</th>
                      <th className="col-opposite">{t.dailyBook.oppositeAccount}</th>
                      <th className="col-description">{t.common.description}</th>
                      <th className="col-amount col-debit">{t.dailyBook.debit}</th>
                      <th className="col-amount col-credit">{t.dailyBook.credit}</th>
                      <th className="col-amount col-balance">{t.common.balance}</th>
                      <th>{t.dailyBook.currencyType}</th>
                      <th className="col-ref">{t.common.reference}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((line) => {
                      const rowProps = clickableTxRowProps(() => openJournalRow(line));
                      const accountCode = displayAccountCode(line.accountCode);
                      const accountLabel = accountCode || "—";
                      const oppositeCode = displayAccountCode(line.oppositeAccountCode);
                      const oppositeLabel = formatOppositeAccount(line);
                      const balanceLabel = line.balanceAfter
                        ? `${line.balanceAfter} ${line.currencyCode}`.trim()
                        : "";
                      return (
                        <tr
                          key={`${line.transactionId}-${line.rowNo}`}
                          {...rowProps}
                          className={`${rowProps.className} is-clickable`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setJournalMenu({ x: e.clientX, y: e.clientY, line });
                          }}
                        >
                          <td className="col-row">{line.rowNo}</td>
                          <td className="col-when">{line.valueDate}</td>
                          <td className="col-account-code" title={accountLabel}>
                            {accountCode ? (
                              <strong className="daybook-account-code">{accountCode}</strong>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{line.accountName || "—"}</td>
                          <td className="col-opposite" title={oppositeLabel}>
                            {oppositeCode ? (
                              <strong className="daybook-account-code">{oppositeCode}</strong>
                            ) : (
                              oppositeLabel
                            )}
                          </td>
                          <td className="col-description">
                            <span className="daybook-type-cell">
                              <TransactionTypeIcon
                                type={line.transactionType}
                                title={transactionTypeLabel(t, line.transactionType)}
                              />
                              <span className="col-description-text">
                                {colorizeAmountsInText(
                                  line.description || "",
                                  descriptionToneFromJournalRow(line),
                                )}
                              </span>
                            </span>
                          </td>
                          <td className={journalDebitClass(line)} style={{ fontWeight: 700 }}>
                            {line.debit || ""}
                          </td>
                          <td className={journalCreditClass(line)} style={{ fontWeight: 700 }}>
                            {line.credit || ""}
                          </td>
                          <td className={`col-amount col-balance ${moneyToneClass(line.balanceAfter)}`}>
                            {balanceLabel ? (
                              <span className="amount-emphasis">{balanceLabel}</span>
                            ) : null}
                          </td>
                          <td>
                            <CurrencyCodeWithFlag code={line.currencyCode} />
                          </td>
                          <td className="col-ref">
                            <span className="daybook-ref-cell">
                              {txDisplayRef(line)}
                              {line.transactionType.toUpperCase() === "HAWALA" ? (
                                <button
                                  type="button"
                                  className="daybook-wa-icon-btn"
                                  title={t.hawala.sendWhatsApp}
                                  aria-label={t.hawala.sendWhatsApp}
                                  disabled={whatsappBusyId === line.transactionId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDaybookWhatsApp(line.transactionId);
                                  }}
                                >
                                  {whatsappBusyId === line.transactionId ? (
                                    <span aria-hidden>…</span>
                                  ) : (
                                    <IconWhatsApp className="daybook-wa-icon" />
                                  )}
                                </button>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={journalPage}
              pageSize={journalPageSize}
              total={journalTotal}
              busy={busy}
              onPageChange={(p) => {
                preferLatestPageRef.current = false;
                const lastPage = Math.max(
                  1,
                  Math.ceil(journalTotal / journalPageSize) || 1,
                );
                stickJournalBottomRef.current = p >= lastPage;
                const el = journalScrollRef.current;
                if (el && p < lastPage) el.scrollTop = 0;
                setJournalPage(p);
              }}
            />
          </section>

          {journalMenu ? (
            <DeskContextMenu
              x={journalMenu.x}
              y={journalMenu.y}
              items={journalContextItems(journalMenu.line)}
              onClose={() => setJournalMenu(null)}
            />
          ) : null}

          <div
            className="row"
            style={{
              marginTop: "1rem",
              justifyContent: "space-between",
              gap: "2rem",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                minWidth: "12rem",
                borderTop: "1px solid rgba(0,0,0,0.25)",
                paddingTop: "0.35rem",
              }}
            >
              {t.users.cashier}
            </div>
            <div
              style={{
                minWidth: "12rem",
                borderTop: "1px solid rgba(0,0,0,0.25)",
                paddingTop: "0.35rem",
              }}
            >
              {t.users.manager}
            </div>
          </div>
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
      <DepositFormModal
        open={depositOpen}
        editTransactionId={editDepositId}
        onClose={() => {
          setDepositOpen(false);
          setEditDepositId(null);
        }}
        onSaved={() => {
          void load();
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
          void load();
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
          void load();
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
          void load();
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
          void load();
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
          void load();
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
          void load();
        }}
      />
    </div>
  );
}
