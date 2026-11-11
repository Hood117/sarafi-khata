import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Printer, Search, Trash2 } from "lucide-react";

import {
  getAppInfo,
  getHawala,
  getTransactionDetail,
  listCurrenciesPage,
  listDaybookJournal,
  softDeleteMovement,
  type CurrencyListItem,
  type DaybookJournalLine,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useCashTracking } from "@desktop/cash-tracking";
import { DepositFormModal } from "@desktop/components/deposit-form-modal";
import { ExchangeFormModal } from "@desktop/components/exchange-form-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { HawalaFormModal } from "@desktop/components/hawala-form-modal";
import { SendHawalaFormModal } from "@desktop/components/send-hawala-form-modal";
import { OpeningBalanceFormModal, isOpeningBalanceMovement } from "@desktop/components/opening-balance-form-modal";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
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
import {
  localizeCurrencyCodesInText,
  moneyToneClass,
} from "@desktop/lib/currency-labels";
import {
  customerStatementAmountTones,
  toSarafiJournalAmounts,
} from "@desktop/lib/customer-statement-amounts";
import { errorMessage, endSubmit, todayIso, tryBeginSubmit } from "@desktop/lib/datetime";
import { journalTxRef } from "@desktop/lib/tx-ref";
import {
  EMPTY_JOURNAL_FILTER_TOTALS,
  journalFilterTotals,
  type JournalCurrencyTotal,
  type JournalFilterTotals,
} from "@desktop/lib/daybook-journal-totals";
import { PageLoadError } from "@desktop/ui/page-load-error";
import {
  exportTable,
  type ExportColumn,
  type ExportRow,
} from "@desktop/lib/export-table";
import { statusLabel, transactionTypeLabel } from "@desktop/lib/i18n-labels";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";
import {
  isSimpleDeskHawala,
} from "@desktop/pages/hawala-helpers";
import {
  printTransactionReceipt,
  type TransactionReceiptLabels,
} from "@desktop/lib/print-transaction-receipt";
import {
  visibleLedgerLines,
  type AmountPart,
} from "@desktop/lib/format-transaction-line";
import { printDaybookLedger } from "@desktop/lib/print-daybook";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Pagination } from "@desktop/ui/pagination";

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 2.08.62 4.02 1.7 5.66L2 22l4.68-1.77a9.9 9.9 0 0 0 5.36 1.56h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2z"
      />
      <path
        fill="#fff"
        d="M17.47 14.38c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.6-1.5-1.87-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.57.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z"
      />
    </svg>
  );
}

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

/** Sarafi Debit column: money removed → red. */
function journalDebitClass(hasAmount: boolean): string {
  return hasAmount ? "col-amount col-debit money-out" : "col-amount col-debit";
}

/** Sarafi Credit / جمع column: money added → green. */
function journalCreditClass(hasAmount: boolean): string {
  return hasAmount ? "col-amount col-credit money-in" : "col-amount col-credit";
}

/** Map asset-convention API debit/credit onto Sarafi journal columns. */
function sarafiJournalLine(line: DaybookJournalLine): DaybookJournalLine {
  const amounts = toSarafiJournalAmounts(line);
  return { ...line, debit: amounts.debit, credit: amounts.credit };
}

function JournalTotalsStack({
  rows,
  tone,
}: {
  rows: JournalCurrencyTotal[];
  /** Force money-in / money-out; default follows amount sign. */
  tone?: "in" | "out";
}) {
  if (rows.length === 0) return null;
  return (
    <div className="daybook-journal-total-stack">
      {rows.map((row) => (
        <div
          key={row.code}
          className={
            tone === "out"
              ? "money-out"
              : tone === "in"
                ? "money-in"
                : moneyToneClass(row.amount)
          }
        >
          <span className="amount-emphasis">
            {row.amount} {row.code}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DaybookPage() {
  const t = useT();
  const { locale, dir } = useLocale();
  const rtl = dir === "rtl";
  const { session } = useAuth();
  const { cashTrackingEnabled } = useCashTracking();
  const { confirm, alert } = useConfirmDialog();
  const [dateFrom, setDateFrom] = useState(todayIso);
  const [dateTo, setDateTo] = useState(todayIso);
  const [journal, setJournal] = useState<DaybookJournalLine[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [dayTotals, setDayTotals] = useState<JournalFilterTotals>(
    EMPTY_JOURNAL_FILTER_TOTALS,
  );
  const [journalPage, setJournalPage] = useState(1);
  const [journalLimitDraft, setJournalLimitDraft] = useState("50");
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
  const [simpleHawalaOpen, setSimpleHawalaOpen] = useState(false);
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
        dateFrom,
        dateTo,
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
  }, [dateFrom, dateTo, currencyFilter, search, journalPage, journalPageSize, t.errors.loadDaybook]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchAllJournalLines = useCallback(async (): Promise<DaybookJournalLine[]> => {
    const pageSize = 100;
    let page = 1;
    let totalPages = 1;
    const all: DaybookJournalLine[] = [];
    while (page <= totalPages) {
      const j = await listDaybookJournal({
        dateFrom,
        dateTo,
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
  }, [dateFrom, dateTo, currencyFilter, search]);

  /** Day Total always covers the full filtered day — never only the visible page. */
  const loadDayTotals = useCallback(async () => {
    try {
      const lines = await fetchAllJournalLines();
      // Totals use Sarafi columns (Credit/جمع = money in, Debit = money out).
      setDayTotals(journalFilterTotals(lines.map(sarafiJournalLine)));
    } catch {
      setDayTotals(EMPTY_JOURNAL_FILTER_TOTALS);
    }
  }, [fetchAllJournalLines]);

  useEffect(() => {
    void loadDayTotals();
  }, [loadDayTotals]);

  const refreshJournal = useCallback(() => {
    void load();
    void loadDayTotals();
  }, [load, loadDayTotals]);

  useEffect(() => {
    // While searching, stay on page 1 from the top — don't jump to the latest page.
    const searching = search.trim().length > 0;
    preferLatestPageRef.current = !searching;
    stickJournalBottomRef.current = !searching;
    setJournalPage(1);
  }, [dateFrom, dateTo, currencyFilter, search, journalPageSize]);

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

  useDeskDataRefresh(() => {
    preferLatestPageRef.current = true;
    stickJournalBottomRef.current = true;
    refreshJournal();
  });

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
      if (!cashTrackingEnabled) return;
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
      void (async () => {
        try {
          const detail = await getHawala(id);
          if (isSimpleDeskHawala(detail)) {
            setEditHawalaId(id);
            setEditHawalaDirection(
              detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
            );
            setSimpleHawalaOpen(true);
            return;
          }
          setEditHawalaId(id);
          setEditHawalaDirection(
            detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
          );
          setSendHawalaOpen(true);
        } catch {
          setEditHawalaId(id);
          setEditHawalaDirection("SEND");
          setSendHawalaOpen(true);
        }
      })();
      return;
    }
    openTxOrDeal(id, type);
  }

  async function handleDeleteMovement(id: string, reference: string) {
    if (!session) return;
    const ok = await confirm({
      title: t.common.delete,
      message: t.desk.deleteTxConfirm.replace("{reference}", reference),
    });
    if (!ok) return;
    if (!tryBeginSubmit(deleteSubmittingRef)) return;
    setError(null);
    try {
      await softDeleteMovement({
        id,
        createdById: session.userId,
      });
      void refreshJournal();
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
        businessName: appInfo.name?.trim() || "Radefy Sarafi Offline",
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
    const vaultCash = isVaultCashMovement(line.transactionType, line.reference);
    const editable =
      isEditableMovement(line.transactionType, line.reference) &&
      !(vaultCash && !cashTrackingEnabled);
    const isHawala = line.transactionType.toUpperCase() === "HAWALA";
    return [
      {
        id: "edit",
        label: t.common.editAction,
        tone: "edit" as const,
        icon: <Pencil size={15} aria-hidden />,
        disabled: !editable,
        onSelect: () =>
          handleEditMovement(line.transactionId, line.transactionType, line.reference),
      },
      {
        id: "delete",
        label: t.common.delete,
        tone: "danger" as const,
        icon: <Trash2 size={15} aria-hidden />,
        disabled: !editable,
        onSelect: () => void handleDeleteMovement(line.transactionId, journalTxRef(line)),
      },
      {
        id: "print",
        label: t.transactions.printReceipt,
        tone: "print" as const,
        icon: <Printer size={15} aria-hidden />,
        onSelect: () => void handlePrintMovement(line),
      },
      ...(isHawala
        ? [
            {
              id: "whatsapp",
              label: t.hawala.sendWhatsApp,
              tone: "accent" as const,
              icon: <IconWhatsApp />,
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
      const amounts = toSarafiJournalAmounts(r);
      const tones = customerStatementAmountTones(amounts);
      const balTone = moneyToneClass(r.balanceAfter);
      return {
        rowNo: String(r.rowNo),
        valueDate: r.valueDate,
        accountCode: displayAccountCode(r.accountCode),
        accountName: r.accountName || "",
        oppositeAccount: formatOppositeAccount(r),
        description: r.description || "",
        debit: amounts.debit || "",
        credit: amounts.credit || "",
        balanceAfter: r.balanceAfter
          ? `${r.balanceAfter} ${r.currencyCode}`.trim()
          : "",
        currencyCode: r.currencyCode || "",
        reference: journalTxRef(r) || "",
        _debitTone: tones.debitTone ?? "",
        _creditTone: tones.creditTone ?? "",
        _balanceTone: balTone.includes("money-in")
          ? "in"
          : balTone.includes("money-out")
            ? "out"
            : "",
      };
    });
  }

  async function handleExportCsv() {
    if (exportBusy) return;
    setExportBusy(true);
    setError(null);
    try {
      const lines = await fetchAllJournalLines();
      const periodLabel =
        dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;
      const path = await exportTable(
        `daybook-${dateFrom}_${dateTo}`,
        journalExportColumns(),
        toExportRows(lines),
        {
          title: t.nav.dailyBook,
          businessName: "Radefy Sarafi Offline",
          periodLabel,
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
        await alert({ title: t.desk.exportCsv, message: path });
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
      const periodLabel =
        dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;
      printDaybookLedger({
        columns: journalExportColumns(),
        rows: toExportRows(lines),
        meta: {
          title: t.nav.dailyBook,
          businessName: appInfo?.name?.trim() || "Radefy Sarafi Offline",
          businessDate: periodLabel,
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

  const journalTotals = dayTotals;

  return (
    <div className="stack daybook-page workspace-page is-daybook">
      {error ? <PageLoadError message={error} onRetry={refreshJournal} /> : null}
      {busy && !hasLoaded ? <p className="muted">{t.common.loading}</p> : null}

      {hasLoaded ? (
        <>
          <section className="panel records-panel daybook-journal-section">
            <div className="records-chrome no-print daybook-records-chrome">
              <div className="records-title daybook-records-head">
                <div>
                  <h2>{t.dailyBook.journal}</h2>
                  <span className="count-badge">{journalTotal}</span>
                </div>
                <div className="records-title-actions">
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
                    className="btn secondary"
                    disabled={exportBusy}
                    onClick={() => void handleExportCsv()}
                  >
                    {t.desk.exportCsv}
                  </button>
                </div>
              </div>
              <div className="table-toolbar daybook-journal-toolbar">
                <div className="daybook-journal-search">
                  <Search size={15} aria-hidden className="daybook-search-icon" />
                  <input
                    type="search"
                    className="daybook-search-input"
                    value={searchDraft}
                    placeholder={t.dailyBook.searchPlaceholder}
                    aria-label={t.common.search}
                    autoComplete="off"
                    onChange={(e) => setSearchDraft(e.target.value)}
                  />
                  {searchDraft ? (
                    <button
                      type="button"
                      className="daybook-search-clear"
                      aria-label={t.common.clear}
                      onClick={() => {
                        setSearchDraft("");
                        setSearch("");
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="table-filters daybook-journal-filters">
                  <label className="daybook-journal-date">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (!next) return;
                        setDateFrom(next);
                        if (next > dateTo) setDateTo(next);
                      }}
                      aria-label={t.common.from}
                      title={t.common.from}
                    />
                  </label>
                  <label className="daybook-journal-date">
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (!next) return;
                        setDateTo(next);
                        if (next < dateFrom) setDateFrom(next);
                      }}
                      aria-label={t.common.to}
                      title={t.common.to}
                    />
                  </label>
                  <div className="daybook-journal-currency">
                    <CurrencyFilter
                      currencies={currencies}
                      value={currencyFilter === "ALL" ? "" : currencyFilter}
                      onChange={(code) => setCurrencyFilter(code || "ALL")}
                      allLabel={t.dailyBook.allCurrencies}
                      hideLabel
                    />
                  </div>
                  <label className="daybook-journal-limit">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      inputMode="numeric"
                      placeholder={t.dailyBook.activityAllDay}
                      value={journalLimitDraft}
                      onChange={(e) => setJournalLimitDraft(e.target.value)}
                      aria-label={t.dailyBook.activityRecords}
                      title={t.dailyBook.activityRecordsHint}
                    />
                  </label>
                </div>
              </div>
            </div>
            {journal.length === 0 && !busy ? (
              <p className="muted" style={{ margin: 0, padding: "18px" }}>
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
                      <th className="col-account-name">{t.dailyBook.accountName}</th>
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
                      // Same Sarafi Credit/جمع ↔ Debit mapping as customer history.
                      const amounts = toSarafiJournalAmounts(line);
                      const displayLine = {
                        ...line,
                        debit: amounts.debit,
                        credit: amounts.credit,
                      };
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
                          <td
                            className="col-account-name"
                            title={line.accountName || undefined}
                          >
                            {line.accountName || "—"}
                          </td>
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
                                  localizeCurrencyCodesInText(
                                    line.description || "",
                                    locale,
                                  ),
                                  descriptionToneFromJournalRow(displayLine),
                                )}
                              </span>
                            </span>
                          </td>
                          <td
                            className={journalDebitClass(Boolean(amounts.debit))}
                            style={{ fontWeight: 700 }}
                          >
                            {amounts.debit || ""}
                          </td>
                          <td
                            className={journalCreditClass(Boolean(amounts.credit))}
                            style={{ fontWeight: 700 }}
                          >
                            {amounts.credit || ""}
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
                              {journalTxRef(line)}
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
                  {journal.length > 0 ? (
                    <tfoot>
                      <tr className="daybook-journal-totals">
                        <td colSpan={6} className="daybook-journal-totals-label">
                          {t.dailyBook.dayTotals}
                        </td>
                        <td className="col-amount col-debit">
                          <div className="muted daybook-journal-total-caption">
                            {t.dailyBook.totalDebit}
                          </div>
                          <JournalTotalsStack rows={journalTotals.debit} tone="out" />
                        </td>
                        <td className="col-amount col-credit">
                          <div className="muted daybook-journal-total-caption">
                            {t.dailyBook.totalCredit}
                          </div>
                          <JournalTotalsStack rows={journalTotals.credit} tone="in" />
                        </td>
                        <td className="col-amount col-balance">
                          <div className="muted daybook-journal-total-caption">
                            {t.dailyBook.closingBalance}
                          </div>
                          <JournalTotalsStack rows={journalTotals.closing} />
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
            <div className="records-pagination">
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
            </div>
          </section>

          {journalMenu ? (
            <DeskContextMenu
              x={journalMenu.x}
              y={journalMenu.y}
              items={journalContextItems(journalMenu.line)}
              onClose={() => setJournalMenu(null)}
            />
          ) : null}
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
          refreshJournal();
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
          refreshJournal();
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
          refreshJournal();
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
          refreshJournal();
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
          refreshJournal();
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
          refreshJournal();
        }}
      />
      {cashTrackingEnabled ? (
        <VaultCashFormModal
          open={cashOpen}
          direction={cashDirection}
          editTransactionId={editCashId}
          onClose={() => {
            setCashOpen(false);
            setEditCashId(null);
          }}
          onSaved={() => {
            refreshJournal();
          }}
        />
      ) : null}
      <OpeningBalanceFormModal
        open={openingOpen}
        editTransactionId={editOpeningId}
        onClose={() => {
          setOpeningOpen(false);
          setEditOpeningId(null);
        }}
        onSaved={() => {
          refreshJournal();
        }}
      />
    </div>
  );
}
