import { type FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  archiveEmployee,
  deleteEmployeeSalaryPayment,
  listCurrenciesPage,
  listEmployees,
  listEmployeeSalaryPayments,
  payEmployeeSalary,
  upsertEmployee,
  type CurrencyListItem,
  type EmployeeRow,
  type EmployeeSalaryMonthTotal,
  type EmployeeSalaryPaymentRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { EmployeeDetailModal } from "@desktop/components/employee-detail-modal";
import { SalaryPaymentDetailModal } from "@desktop/components/salary-payment-detail-modal";
import { AmountInput } from "@desktop/ui/amount-input";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { Pagination } from "@desktop/ui/pagination";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import {
  endSubmit,
  errorMessage,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { notifyDeskDataChanged } from "@desktop/lib/desk-events";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { useT } from "@desktop/i18n";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import {
  DEFAULT_CURRENCY_CODE,
  pickDefaultCurrency,
} from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";

const EMP_PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 15;

type Tab = "employees" | "history";

function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

export function EmployeesPage() {
  const t = useT();
  const { session } = useAuth();
  const today = todayIso();
  const isAdmin = session?.role?.toUpperCase() === "ADMIN";

  const [tab, setTab] = useState<Tab>("employees");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [empTotal, setEmpTotal] = useState(0);
  const [empPage, setEmpPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();
  const { confirm } = useConfirmDialog();

  const [detailEmployee, setDetailEmployee] = useState<EmployeeRow | null>(null);
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);

  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editEmp, setEditEmp] = useState<EmployeeRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [field, setField] = useState("");
  const [codeNo, setCodeNo] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [savingEmp, setSavingEmp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showPay, setShowPay] = useState(false);
  const [payEmployee, setPayEmployee] = useState<EmployeeRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(() => todayIso());
  const [replacePaymentId, setReplacePaymentId] = useState<string | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const submittingPayRef = useRef(false);
  const empFormRef = useRef<HTMLFormElement>(null);
  const payFormRef = useRef<HTMLFormElement>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<EmployeeSalaryPaymentRow | null>(null);
  const [empMenu, setEmpMenu] = useState<{
    x: number;
    y: number;
    emp: EmployeeRow;
  } | null>(null);
  const [payMenu, setPayMenu] = useState<{
    x: number;
    y: number;
    row: EmployeeSalaryPaymentRow;
  } | null>(null);

  const [historyItems, setHistoryItems] = useState<EmployeeSalaryPaymentRow[]>([]);
  const [historyTotals, setHistoryTotals] = useState<EmployeeSalaryMonthTotal[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState(() => monthStart(todayIso()));
  const [historyTo, setHistoryTo] = useState(() => todayIso());
  const [historyBusy, setHistoryBusy] = useState(false);
  const deletePayRef = useRef(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setEmpPage(1);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setHistorySearch(historySearchInput.trim());
      setHistoryPage(1);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [historySearchInput]);

  const loadEmployees = useCallback(async () => {
    const page = await listEmployees({
      search: search || undefined,
      activeOnly: true,
      page: empPage,
      pageSize: EMP_PAGE_SIZE,
    });
    setEmployees(page.items);
    setEmpTotal(page.total);
    setDetailEmployee((prev) => {
      if (!prev) return null;
      return page.items.find((e) => e.id === prev.id) ?? prev;
    });
  }, [search, empPage]);

  const loadHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const page = await listEmployeeSalaryPayments({
        search: historySearch || undefined,
        dateFrom: historyFrom || undefined,
        dateTo: historyTo || undefined,
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
      });
      setHistoryItems(page.items);
      setHistoryTotals(page.monthTotals);
      setHistoryTotal(page.total);
    } finally {
      setHistoryBusy(false);
    }
  }, [historySearch, historyFrom, historyTo, historyPage]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const ccy = await listCurrenciesPage({ activeOnly: true, pageSize: 200 });
        if (cancelled) return;
        setCurrencies(ccy.items);
        setPayCurrency(pickDefaultCurrency(ccy.items));
        await loadEmployees();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t.errors.loadGeneric));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEmployees, t.errors.loadGeneric]);

  useEffect(() => {
    if (tab !== "history") return;
    void loadHistory().catch((err: unknown) =>
      setError(errorMessage(err, t.errors.loadGeneric)),
    );
  }, [tab, loadHistory, t.errors.loadGeneric]);

  useDeskDataRefresh(() => {
    void loadEmployees().catch(() => undefined);
    if (tab === "history") {
      void loadHistory().catch(() => undefined);
    }
    setLedgerRefreshKey((k) => k + 1);
  });

  function resetEmployeeForm() {
    setFullName("");
    setField("");
    setCodeNo("");
    setTitle("");
    setNotes("");
    setStartDate("");
    setFormError(null);
  }

  function openAddEmployee() {
    setEditEmp(null);
    resetEmployeeForm();
    setShowEmpForm(true);
  }

  function openEditEmployee(emp: EmployeeRow) {
    setEditEmp(emp);
    setFullName(emp.fullName);
    setField(emp.fatherName ?? "");
    setCodeNo(emp.idNumber ?? "");
    setTitle(emp.title ?? "");
    setNotes(emp.notes ?? "");
    setStartDate(emp.startDate?.slice(0, 10) ?? "");
    setFormError(null);
    setShowEmpForm(true);
  }

  async function onSaveEmployee(e: FormEvent) {
    e.preventDefault();
    setSavingEmp(true);
    setFormError(null);
    try {
      const saved = await upsertEmployee({
        id: editEmp?.id,
        fullName,
        fatherName: field || undefined,
        idNumber: codeNo || undefined,
        title: title || undefined,
        notes: notes || undefined,
        startDate: startDate || undefined,
        isActive: true,
      });
      setShowEmpForm(false);
      showSuccess(t.employees.savedOk.replace("{name}", saved.fullName));
      setDetailEmployee(saved);
      await loadEmployees();
    } catch (err) {
      setFormError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      setSavingEmp(false);
    }
  }

  async function onDeleteEmployee(emp: EmployeeRow) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: t.common.delete,
      message: t.employees.deleteConfirm.replace("{name}", emp.fullName),
    });
    if (!ok) return;
    try {
      await archiveEmployee(emp.id, session?.userId);
      showSuccess(t.employees.deletedOk.replace("{name}", emp.fullName));
      setDetailEmployee(null);
      await loadEmployees();
    } catch (err) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    }
  }

  function openPay(emp: EmployeeRow) {
    setPayEmployee(emp);
    setPayAmount("");
    setPayNotes("");
    setPayDate(today);
    setPayCurrency(pickDefaultCurrency(currencies));
    setReplacePaymentId(null);
    setPayError(null);
    setShowPay(true);
  }

  function openEditPayment(row: EmployeeSalaryPaymentRow) {
    const emp =
      employees.find((e) => e.id === row.employeeId) ??
      ({
        id: row.employeeId,
        fullName: row.employeeName,
        fatherName: null,
        nationalId: null,
        idNumber: null,
        dateOfBirth: null,
        address: null,
        phone: null,
        title: null,
        notes: null,
        startDate: null,
        monthlySalary: null,
        salaryCurrencyCode: null,
        isActive: true,
        createdAt: "",
        updatedAt: "",
      } satisfies EmployeeRow);
    setPayEmployee(emp);
    setPayAmount(row.amount);
    setPayNotes(row.notes ?? "");
    setPayDate(String(row.valueDate).slice(0, 10));
    setPayCurrency(row.currencyCode || pickDefaultCurrency(currencies));
    setReplacePaymentId(row.id);
    setPayError(null);
    setShowPay(true);
  }

  async function onPaySalary(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId || !payEmployee) return;
    if (!tryBeginSubmit(submittingPayRef)) return;
    setSavingPay(true);
    setPayError(null);
    try {
      const result = await payEmployeeSalary({
        employeeId: payEmployee.id,
        currencyCode: payCurrency,
        amount: payAmount,
        notes: payNotes || undefined,
        valueDate: payDate || undefined,
        createdById: session.userId,
        replacePaymentId: replacePaymentId || undefined,
      });
      setShowPay(false);
      setReplacePaymentId(null);
      notifyDeskDataChanged();
      showSuccess(
        t.employees.paidOk
          .replace("{amount}", result.amount)
          .replace("{currency}", result.currencyCode)
          .replace("{name}", result.employeeName),
      );
      setLedgerRefreshKey((k) => k + 1);
      if (tab === "history") await loadHistory();
    } catch (err) {
      setPayError(errorMessage(err, t.errors.salarySave));
    } finally {
      endSubmit(submittingPayRef);
      setSavingPay(false);
    }
  }

  async function onHardDeletePayment(row: EmployeeSalaryPaymentRow) {
    const ok = await confirm({
      title: t.common.delete,
      message: t.employees.deletePaymentConfirm,
    });
    if (!ok) return;
    if (!tryBeginSubmit(deletePayRef)) return;
    try {
      await deleteEmployeeSalaryPayment(row.id, session?.userId);
      notifyDeskDataChanged();
      showSuccess(t.employees.paymentDeletedOk);
      setPaymentDetail(null);
      setLedgerRefreshKey((k) => k + 1);
      await loadHistory();
    } catch (err) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      endSubmit(deletePayRef);
    }
  }

  const historyPeriodSummary =
    historyTotals.length === 0
      ? "—"
      : historyTotals
          .map((row) => `${row.amount} ${row.currencySymbol?.trim() || row.currencyCode}`)
          .join(" · ");

  return (
    <div className="stack employees-page workspace-page">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => {
            setBusy(true);
            void (tab === "history" ? loadHistory() : loadEmployees())
              .then(() => setError(null))
              .catch((err: unknown) => setError(errorMessage(err, t.errors.loadGeneric)))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.pages.employees}</h2>
              <span className="count-badge">
                {tab === "employees" ? empTotal : historyTotal}
              </span>
            </div>
            <div className="records-title-actions">
              <div
                className="settings-tabs currency-panel-tabs"
                role="tablist"
                aria-label={t.pages.employees}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "employees"}
                  className={`settings-tab${tab === "employees" ? " active" : ""}`}
                  onClick={() => setTab("employees")}
                >
                  {t.employees.employeesTab}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "history"}
                  className={`settings-tab${tab === "history" ? " active" : ""}`}
                  onClick={() => setTab("history")}
                >
                  {t.employees.historyTab}
                </button>
              </div>
              {tab === "employees" ? (
                <button
                  type="button"
                  className="btn primary"
                  data-desk-action="new"
                  data-desk-primary
                  onClick={openAddEmployee}
                >
                  {t.employees.add}
                </button>
              ) : null}
            </div>
          </div>
          {tab === "employees" ? (
            <div className="table-toolbar">
              <label className="search-field search-field-emphasized">
                <input
                  type="search"
                  className="desk-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t.employees.searchPlaceholder}
                  aria-label={t.common.search}
                />
              </label>
            </div>
          ) : (
            <div className="table-toolbar">
              <label className="search-field search-field-emphasized">
                <input
                  type="search"
                  className="desk-search"
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  placeholder={t.employees.searchHistoryPlaceholder}
                  aria-label={t.common.search}
                />
              </label>
              <div className="table-filters">
                <label>
                  <input
                    type="date"
                    value={historyFrom}
                    max={historyTo || today}
                    aria-label={t.common.fromDate}
                    title={t.common.fromDate}
                    onChange={(e) => {
                      setHistoryFrom(e.target.value);
                      setHistoryPage(1);
                    }}
                  />
                </label>
                <label>
                  <input
                    type="date"
                    value={historyTo}
                    min={historyFrom || undefined}
                    max={today}
                    aria-label={t.common.toDate}
                    title={t.common.toDate}
                    onChange={(e) => {
                      setHistoryTo(e.target.value);
                      setHistoryPage(1);
                    }}
                  />
                </label>
                <p className="muted" style={{ margin: 0, alignSelf: "center" }}>
                  {t.employees.periodTotal}: <strong>{historyPeriodSummary}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        {tab === "employees" ? (
          <>
            {busy && employees.length === 0 ? (
              <p className="muted" style={{ padding: "12px 18px" }}>
                {t.common.loading}
              </p>
            ) : null}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.common.name}</th>
                    <th>{t.employees.field}</th>
                    <th>{t.employees.codeNo}</th>
                    <th>{t.employees.jobTitle}</th>
                    <th>{t.employees.startDate}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {!busy && employees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        {t.employees.empty}
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp) => (
                      <tr
                        key={emp.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setEmpMenu({ x: e.clientX, y: e.clientY, emp });
                        }}
                      >
                        <td>
                          <strong>{emp.fullName}</strong>
                        </td>
                        <td>{emp.fatherName || "—"}</td>
                        <td className="ltr-text">{emp.idNumber || "—"}</td>
                        <td>{emp.title || "—"}</td>
                        <td>{emp.startDate ? String(emp.startDate).slice(0, 10) : "—"}</td>
                        <td>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                void onDeleteEmployee(emp);
                              }}
                            >
                              {t.common.delete}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <Pagination
                page={empPage}
                pageSize={EMP_PAGE_SIZE}
                total={empTotal}
                busy={busy}
                onPageChange={setEmpPage}
              />
            </div>
          </>
        ) : (
          <>
            {historyBusy && historyItems.length === 0 ? (
              <p className="muted" style={{ padding: "12px 18px" }}>
                {t.common.loading}
              </p>
            ) : null}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.employees.employee}</th>
                    <th>{t.common.amount}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.common.notes}</th>
                  </tr>
                </thead>
                <tbody>
                  {!historyBusy && historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        {t.employees.emptyHistory}
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((row) => (
                      <tr
                        key={row.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setPayMenu({ x: e.clientX, y: e.clientY, row });
                        }}
                      >
                        <td>{String(row.valueDate).slice(0, 10)}</td>
                        <td>
                          <strong>{row.employeeName}</strong>
                        </td>
                        <td className="money-out">
                          {row.amount} {row.currencySymbol?.trim() || row.currencyCode}
                        </td>
                        <td className="ltr-text">{txDisplayRef(row)}</td>
                        <td>{row.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <Pagination
                page={historyPage}
                pageSize={HISTORY_PAGE_SIZE}
                total={historyTotal}
                busy={historyBusy}
                onPageChange={setHistoryPage}
              />
            </div>
          </>
        )}
      </section>

      {empMenu ? (
        <DeskContextMenu
          x={empMenu.x}
          y={empMenu.y}
          items={[
            {
              id: "ledger",
              label: t.employees.openLedger,
              onSelect: () => setDetailEmployee(empMenu.emp),
            },
            {
              id: "pay",
              label: t.employees.paySalary,
              onSelect: () => openPay(empMenu.emp),
            },
            {
              id: "edit",
              label: t.common.editAction,
              onSelect: () => openEditEmployee(empMenu.emp),
            },
            ...(isAdmin
              ? [
                  {
                    id: "delete",
                    label: t.common.delete,
                    danger: true,
                    onSelect: () => void onDeleteEmployee(empMenu.emp),
                  },
                ]
              : []),
          ]}
          onClose={() => setEmpMenu(null)}
        />
      ) : null}

      {payMenu ? (
        <DeskContextMenu
          x={payMenu.x}
          y={payMenu.y}
          items={[
            {
              id: "details",
              label: t.common.details,
              onSelect: () => setPaymentDetail(payMenu.row),
            },
            {
              id: "edit",
              label: t.common.editAction,
              onSelect: () => openEditPayment(payMenu.row),
            },
            {
              id: "delete",
              label: t.common.delete,
              danger: true,
              onSelect: () => void onHardDeletePayment(payMenu.row),
            },
          ]}
          onClose={() => setPayMenu(null)}
        />
      ) : null}

      <EmployeeDetailModal
        employee={detailEmployee}
        isAdmin={isAdmin}
        ledgerRefreshKey={ledgerRefreshKey}
        onClose={() => setDetailEmployee(null)}
        onEdit={openEditEmployee}
        onPay={openPay}
        onDelete={(emp) => void onDeleteEmployee(emp)}
        onOpenPayment={setPaymentDetail}
      />

      {showEmpForm ? (
        <Modal
          title={editEmp ? t.employees.edit : t.employees.add}
          size="lg"
          onClose={() => !savingEmp && setShowEmpForm(false)}
        >
          <form
            ref={empFormRef}
            className="stack"
            data-desk-form
            onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
              handleDeskFormKeyDown(e, {
                busy: savingEmp,
                onSubmit: () => empFormRef.current?.requestSubmit(),
              })
            }
            onSubmit={(e) => void onSaveEmployee(e)}
          >
            <div className="customer-form-grid">
              <label className="stack">
                <span>{t.common.name} *</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="stack">
                <span>{t.employees.field}</span>
                <input value={field} onChange={(e) => setField(e.target.value)} />
              </label>
              <label className="stack">
                <span>{t.employees.codeNo}</span>
                <input
                  className="ltr-text"
                  dir="ltr"
                  value={codeNo}
                  onChange={(e) => setCodeNo(e.target.value)}
                />
              </label>
              <label className="stack">
                <span>{t.employees.startDate}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="stack">
                <span>{t.employees.jobTitle}</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="stack exchange-span-2">
                <span>{t.common.notes}</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </label>
            </div>
            <ModalErrorBanner message={formError} />
            <div className="row" style={{ gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                disabled={savingEmp}
                onClick={() => setShowEmpForm(false)}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                data-desk-action="save"
                disabled={savingEmp || !fullName.trim()}
              >
                {savingEmp ? t.common.saving : t.common.save}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showPay && payEmployee ? (
        <Modal
          title={
            replacePaymentId
              ? `${t.employees.editPayment} — ${payEmployee.fullName}`
              : `${t.employees.paySalary} — ${payEmployee.fullName}`
          }
          onClose={() => {
            if (!savingPay) {
              setShowPay(false);
              setReplacePaymentId(null);
            }
          }}
        >
          <form
            ref={payFormRef}
            className="stack"
            data-desk-form
            onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
              handleDeskFormKeyDown(e, {
                busy: savingPay,
                onSubmit: () => payFormRef.current?.requestSubmit(),
              })
            }
            onSubmit={(e) => void onPaySalary(e)}
          >
            <p className="muted" style={{ margin: 0 }}>
              {t.employees.payHint}
            </p>
            <div className="money-ccy-row">
              <label className="money-ccy-amount">
                {t.common.amount} *
                <AmountInput
                  value={payAmount}
                  onValueChange={setPayAmount}
                  required
                  autoFocus
                />
              </label>
              <CurrencyPicker
                label={t.common.currency}
                required
                currencies={currencies}
                value={payCurrency}
                onChange={setPayCurrency}
                onCurrenciesChange={setCurrencies}
                emptyLabel={t.common.noData}
                searchPlaceholder={t.common.search}
              />
            </div>
            <label className="stack">
              <span>{t.common.date}</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </label>
            <label className="stack">
              <span>{t.common.notes}</span>
              <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} />
            </label>
            <ModalErrorBanner message={payError} />
            <div className="row" style={{ gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                disabled={savingPay}
                onClick={() => {
                  setShowPay(false);
                  setReplacePaymentId(null);
                }}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                data-desk-action="save"
                disabled={savingPay || !payAmount.trim()}
              >
                {savingPay
                  ? t.common.saving
                  : replacePaymentId
                    ? t.common.save
                    : t.employees.paySalary}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <SalaryPaymentDetailModal
        detail={paymentDetail}
        onClose={() => setPaymentDetail(null)}
      />
      {successModal}
    </div>
  );
}
