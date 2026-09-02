import { useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { getAppInfo, type EmployeeSalaryPaymentRow } from "@desktop/api";
import { useT } from "@desktop/i18n";
import { cashWalletLabelT } from "@desktop/lib/user-facing-wallets";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19).replace("T", " ") : value.slice(0, 10);
}

/** Row props for clickable salary payment tables. */
export function clickableSalaryPaymentRowProps(onOpen: () => void) {
  return {
    className: "customer-row-clickable",
    tabIndex: 0 as const,
    role: "button" as const,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

type ModalProps = {
  detail: EmployeeSalaryPaymentRow | null;
  onClose: () => void;
};

/**
 * Salary payment detail — same screen/print pattern as transaction & expense detail.
 */
export function SalaryPaymentDetailModal({ detail, onClose }: ModalProps) {
  const t = useT();
  const [businessName, setBusinessName] = useState("ASMS");

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

  if (!detail) return null;

  const paidFrom = cashWalletLabelT(t, {
    type: detail.cashWalletType,
    name: detail.cashWalletName,
  });
  const amountLabel = `${detail.amount} ${detail.currencyCode}`;
  const summary = `${t.desk.salary} · ${detail.employeeName} · ${amountLabel}`;

  function handlePrint() {
    document.body.classList.add("tx-printing");
    window.print();
    window.setTimeout(() => document.body.classList.remove("tx-printing"), 1000);
  }

  return (
    <Modal
      title={t.employees.paymentDetailTitle.replace("{reference}", txDisplayRef(detail))}
      size="lg"
      onClose={onClose}
    >
      <div className="stack">
        <div className="tx-detail-screen no-print stack">
          <p style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600 }}>
            {summary}
          </p>

          <div className="customer-form-grid">
            <div>
              <span className="muted">{t.employees.employee}</span>
              <div>{detail.employeeName}</div>
            </div>
            <div>
              <span className="muted">{t.common.amount}</span>
              <div>
                <span className="tx-amt tx-amt-out">{amountLabel}</span>
              </div>
            </div>
            <div>
              <span className="muted">{t.common.date}</span>
              <div>{formatWhen(detail.valueDate)}</div>
            </div>
            <div>
              <span className="muted">{t.common.reference}</span>
              <div className="col-ref">{txDisplayRef(detail)}</div>
            </div>
            <div>
              <span className="muted">{t.employees.paidFrom}</span>
              <div>{paidFrom}</div>
            </div>
            <div>
              <span className="muted">{t.common.notes}</span>
              <div>{(detail.notes ?? "").trim() || "—"}</div>
            </div>
          </div>
        </div>

        {createPortal(
          <div className="tx-print-receipt" aria-hidden="true">
            <h1 className="tx-print-brand">{businessName}</h1>
            <p className="tx-print-subtitle">{t.transactions.receipt}</p>
            <hr className="tx-print-rule" />
            <p className="tx-print-summary">{summary}</p>
            <hr className="tx-print-rule" />
            <div className="tx-print-row">
              <span>{t.common.reference}</span>
              <strong>{txDisplayRef(detail)}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.date}</span>
              <strong>{formatWhen(detail.valueDate)}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.employees.employee}</span>
              <strong>{detail.employeeName}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.type}</span>
              <strong>{t.desk.salary}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.amount}</span>
              <strong className="tx-print-amount">{amountLabel}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.employees.paidFrom}</span>
              <strong>{paidFrom}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.notes}</span>
              <strong>{(detail.notes ?? "").trim() || "—"}</strong>
            </div>
            <hr className="tx-print-rule" />
            <p className="tx-print-thanks">{t.transactions.thankYou}</p>
            <div className="tx-print-sig">
              <div>{t.employees.employee}</div>
              <div>{t.users.cashier}</div>
            </div>
          </div>,
          document.body,
        )}

        <div className="row no-print" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className="secondary" onClick={handlePrint}>
            {t.common.print}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.back}
          </button>
        </div>
      </div>
    </Modal>
  );
}
