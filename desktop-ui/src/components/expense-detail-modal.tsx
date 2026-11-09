import { useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { getAppInfo, type ExpenseRow } from "@desktop/api";
import { useLocale, useT } from "@desktop/i18n";
import { localizedCurrencyName } from "@desktop/lib/currency-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19).replace("T", " ") : value.slice(0, 10);
}

function paidFromLabel(
  name: string | null | undefined,
  labels: { mainVault: string; cashTill: string },
): string {
  const n = (name ?? "").trim();
  if (!n) return "—";
  if (/^main\s*vault$/i.test(n) || /^vault$/i.test(n)) return labels.mainVault;
  if (/^cash\s*till$/i.test(n) || /^till$/i.test(n) || /^cashier/i.test(n)) {
    return labels.cashTill;
  }
  return n;
}

/** Row props for clickable expense tables. */
export function clickableExpenseRowProps(onOpen: () => void) {
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
  detail: ExpenseRow | null;
  onClose: () => void;
};

/**
 * Expense detail modal — expenses list. Print receipt matches transaction style.
 */
export function ExpenseDetailModal({ detail, onClose }: ModalProps) {
  const t = useT();
  const { locale } = useLocale();
  const [businessName, setBusinessName] = useState("Radefy Sarafi Offline");

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

  const category = detail.categoryLabel || detail.category || "—";
  const currency =
    [
      detail.currencyCode,
      detail.currencySymbol ? `(${detail.currencySymbol})` : null,
    ]
      .filter(Boolean)
      .join(" ") || "—";
  const paidFrom = paidFromLabel(detail.cashWalletName, {
    mainVault: t.desk.mainVault,
    cashTill: t.desk.cashTill,
  });
  const summary = `${category} · ${detail.amount} ${detail.currencyCode}`;

  function handlePrint() {
    document.body.classList.add("tx-printing");
    window.print();
    window.setTimeout(() => document.body.classList.remove("tx-printing"), 1000);
  }

  return (
    <Modal
      title={t.customers.ledgerTitle.replace("{reference}", txDisplayRef(detail))}
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
              <span className="muted">{t.expenses.category}</span>
              <div>{category}</div>
            </div>
            <div>
              <span className="muted">{t.common.amount}</span>
              <div>
                <span className="tx-amt tx-amt-out">
                  {detail.amount} {detail.currencyCode}
                </span>
              </div>
            </div>
            <div>
              <span className="muted">{t.common.currency}</span>
              <div>
                {currency}
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {localizedCurrencyName(
                    detail.currencyCode,
                    locale,
                    detail.currencyName,
                  )}
                </div>
              </div>
            </div>
            <div>
              <span className="muted">{t.common.reference}</span>
              <div className="col-ref">{txDisplayRef(detail)}</div>
            </div>
            <div>
              <span className="muted">{t.expenses.cashWallet}</span>
              <div>{paidFrom}</div>
            </div>
            <div>
              <span className="muted">{t.common.user}</span>
              <div>{detail.createdByName ?? "—"}</div>
            </div>
            <div>
              <span className="muted">{t.common.date}</span>
              <div>{formatWhen(detail.valueDate)}</div>
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
              <span>{t.expenses.category}</span>
              <strong>{category}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.amount}</span>
              <strong className="tx-print-amount">
                {detail.amount} {detail.currencyCode}
              </strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.currency}</span>
              <strong>{currency}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.expenses.cashWallet}</span>
              <strong>{paidFrom}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.user}</span>
              <strong>{detail.createdByName ?? "—"}</strong>
            </div>
            <div className="tx-print-row">
              <span>{t.common.notes}</span>
              <strong>{(detail.notes ?? "").trim() || "—"}</strong>
            </div>
            <hr className="tx-print-rule" />
            <p className="tx-print-thanks">{t.transactions.thankYou}</p>
            <div className="tx-print-sig">
              <div>Cashier</div>
              <div>Manager</div>
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
