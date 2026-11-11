import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  getAppInfo,
  listEmployeeSalaryPayments,
  type EmployeeRow,
  type EmployeeSalaryMonthlyBreakdown,
  type EmployeeSalaryPaymentRow,
} from "@desktop/api";
import { clickableSalaryPaymentRowProps } from "@desktop/components/salary-payment-detail-modal";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";
import { printTxReceiptFromDom } from "@desktop/lib/print-transaction-receipt";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";

const PAY_PAGE_SIZE = 15;

function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

function formatMonthLabel(ym: string): string {
  const [yearRaw, monthRaw] = ym.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return ym;
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

function formatCurrencyAmount(
  amount: string,
  currencyCode: string,
  currencySymbol: string | null | undefined,
): string {
  const symbol = currencySymbol?.trim();
  return symbol ? `${amount} ${symbol}` : `${amount} ${currencyCode}`;
}

function groupMonthlyBreakdown(rows: EmployeeSalaryMonthlyBreakdown[]) {
  const map = new Map<string, EmployeeSalaryMonthlyBreakdown[]>();
  for (const row of rows) {
    const list = map.get(row.month) ?? [];
    list.push(row);
    map.set(row.month, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, amounts]) => ({ month, amounts }));
}

type Props = {
  employee: EmployeeRow | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (employee: EmployeeRow) => void;
  onPay: (employee: EmployeeRow) => void;
  onDelete: (employee: EmployeeRow) => void;
  onOpenPayment: (payment: EmployeeSalaryPaymentRow) => void;
  /** Bump to refresh ledger after a new payment. */
  ledgerRefreshKey?: number;
};

export function EmployeeDetailModal({
  employee,
  isAdmin,
  onClose,
  onEdit,
  onPay,
  onDelete,
  onOpenPayment,
  ledgerRefreshKey = 0,
}: Props) {
  const t = useT();
  const today = todayIso();
  const [businessName, setBusinessName] = useState("Radefy Sarafi Offline");
  const [dateFrom, setDateFrom] = useState(() => monthStart(todayIso()));
  const [dateTo, setDateTo] = useState(() => todayIso());
  const [payments, setPayments] = useState<EmployeeSalaryPaymentRow[]>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<EmployeeSalaryMonthlyBreakdown[]>([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAppInfo()
      .then((info) => {
        if (!cancelled && info.name?.trim()) setBusinessName(info.name.trim());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("tx-printing");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      cleanup();
    };
  }, []);

  useEffect(() => {
    setPayPage(1);
    setDateFrom(monthStart(todayIso()));
    setDateTo(todayIso());
  }, [employee?.id]);

  const loadLedger = useCallback(async () => {
    if (!employee) {
      setPayments([]);
      setMonthlyBreakdown([]);
      setPayTotal(0);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ledger = await listEmployeeSalaryPayments({
        employeeId: employee.id,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: payPage,
        pageSize: PAY_PAGE_SIZE,
      });
      setPayments(ledger.items);
      setMonthlyBreakdown(ledger.monthlyBreakdown ?? []);
      setPayTotal(ledger.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [employee, dateFrom, dateTo, payPage]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger, ledgerRefreshKey]);

  const monthlyGroups = useMemo(
    () => groupMonthlyBreakdown(monthlyBreakdown),
    [monthlyBreakdown],
  );

  if (!employee) return null;

  const periodHint = `${dateFrom} → ${dateTo}`;

  function handlePrint() {
    printTxReceiptFromDom();
  }

  return (
    <Modal
      title={t.employees.individualLedger.replace("{name}", employee.fullName)}
      size="lg"
      onClose={onClose}
    >
      <div className="stack employee-ledger-modal">
        <div className="tx-detail-screen no-print employee-ledger-screen">
          <div className="employee-ledger-toolbar">
            <div className="employee-ledger-filters">
              <label className="employee-ledger-filter">
                <span className="muted">{t.common.fromDate}</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || today}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPayPage(1);
                  }}
                />
              </label>
              <label className="employee-ledger-filter">
                <span className="muted">{t.common.toDate}</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  max={today}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPayPage(1);
                  }}
                />
              </label>
            </div>
            <p className="muted employee-ledger-period">{periodHint}</p>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <section className="employee-ledger-section" aria-label={t.employees.monthTotal}>
            {busy && monthlyGroups.length === 0 ? (
              <p className="muted">{t.common.loading}</p>
            ) : monthlyGroups.length === 0 ? (
              <p className="muted employee-ledger-empty">{t.employees.noPayments}</p>
            ) : (
              <div className="employee-ledger-monthly">
                <div className="employee-ledger-monthly-head">
                  <span>{t.employees.month}</span>
                  <span>{t.employees.monthTotal}</span>
                </div>
                {monthlyGroups.map(({ month, amounts }) => (
                  <div key={month} className="employee-ledger-monthly-row">
                    <span className="employee-ledger-month-label">{formatMonthLabel(month)}</span>
                    <span className="employee-ledger-month-amount money-out">
                      {amounts
                        .map((row) =>
                          formatCurrencyAmount(row.amount, row.currencyCode, row.currencySymbol),
                        )
                        .join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="employee-ledger-section" aria-label={t.employees.ledgerTitle}>
            {busy && payments.length === 0 && monthlyGroups.length > 0 ? (
              <p className="muted">{t.common.loading}</p>
            ) : null}
            {payments.length === 0 && !busy ? null : (
              <div className="employee-ledger-payments">
                <table className="employee-ledger-table">
                  <thead>
                    <tr>
                      <th>{t.common.date}</th>
                      <th>{t.common.amount}</th>
                      <th>{t.common.reference}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        {...clickableSalaryPaymentRowProps(() => onOpenPayment(p))}
                        aria-label={txDisplayRef(p)}
                      >
                        <td>{formatDay(p.valueDate)}</td>
                        <td className="money-out">
                          <strong>
                            {formatCurrencyAmount(p.amount, p.currencyCode, p.currencySymbol)}
                          </strong>
                        </td>
                        <td className="ltr-text">{txDisplayRef(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={payPage}
              pageSize={PAY_PAGE_SIZE}
              total={payTotal}
              busy={busy}
              onPageChange={setPayPage}
            />
          </section>
        </div>

        {createPortal(
          <div className="tx-print-receipt employee-ledger-print" aria-hidden="true">
            <h1 className="tx-print-brand">{businessName}</h1>
            <p className="tx-print-subtitle">{t.employees.ledgerTitle}</p>
            <hr className="tx-print-rule" />
            <div className="tx-print-row">
              <span>{t.employees.employee}</span>
              <strong>{employee.fullName}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.date}</span>
              <strong>{periodHint}</strong>
            </div>
            <hr className="tx-print-rule" />
            {monthlyGroups.map(({ month, amounts }) => (
              <div key={month} className="tx-print-row">
                <span>{formatMonthLabel(month)}</span>
                <strong>
                  {amounts
                    .map((row) =>
                      formatCurrencyAmount(row.amount, row.currencyCode, row.currencySymbol),
                    )
                    .join(" · ")}
                </strong>
              </div>
            ))}
            <hr className="tx-print-rule" />
            {payments.map((p) => (
              <div key={p.id} className="tx-print-row">
                <span>{formatDay(p.valueDate)}</span>
                <strong>
                  {formatCurrencyAmount(p.amount, p.currencyCode, p.currencySymbol)} ·{" "}
                  {txDisplayRef(p)}
                </strong>
              </div>
            ))}
            <hr className="tx-print-rule" />
            <p className="tx-print-thanks">{t.transactions.thankYou}</p>
          </div>,
          document.body,
        )}

        <div className="row no-print employee-ledger-actions">
          <button type="button" className="secondary" data-desk-action="print" onClick={handlePrint}>
            {t.common.print}
          </button>
          <button type="button" className="secondary" onClick={() => onEdit(employee)}>
            {t.common.editAction}
          </button>
          <button type="button" className="secondary" onClick={() => onPay(employee)}>
            {t.employees.paySalary}
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="secondary"
              data-desk-action="delete"
              onClick={() => onDelete(employee)}
            >
              {t.common.delete}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
