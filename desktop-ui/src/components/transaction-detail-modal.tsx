import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

import {
  getAppInfo,
  getTransactionDetail,
  type TransactionDetail,
} from "@desktop/api";
import { TransactionLine } from "@desktop/components/transaction-line";
import { useT } from "@desktop/i18n";
import {
  fmtAmountPart,
  formatTransactionLine,
  visibleLedgerLines,
  type AmountPart,
} from "@desktop/lib/format-transaction-line";
import { statusLabel, transactionTypeLabel } from "@desktop/lib/i18n-labels";
import { journalTxRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19).replace("T", " ") : value.slice(0, 10);
}

function amountPartsFromDetail(detail: TransactionDetail): AmountPart[] {
  return visibleLedgerLines(detail.lines).map((l) => ({
    sign: l.direction === "DEBIT" ? ("+" as const) : ("−" as const),
    currency: l.currencyCode,
    amount: l.amount,
  }));
}

/** Row props for clickable transaction tables (keyboard + mouse). */
export function clickableTxRowProps(onOpen: () => void) {
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

export function useTransactionDetailModal() {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (txId: string) => {
    const id = txId.trim();
    if (!id) return;
    setDetail(null);
    setBusy(true);
    setError(null);
    try {
      setDetail(await getTransactionDetail(id));
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const close = useCallback(() => {
    setDetail(null);
    setError(null);
    setBusy(false);
  }, []);

  return { detail, busy, error, open, close };
}

type ModalProps = {
  detail: TransactionDetail | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
};

/**
 * Shared transaction detail modal — used by customer history, transactions list,
 * dashboard recent activity, and reports.
 */
export function TransactionDetailModal({
  detail,
  busy,
  error,
  onClose,
}: ModalProps) {
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

  if (!detail && !busy && !error) return null;

  const amounts = detail ? amountPartsFromDetail(detail) : [];
  const lines = detail ? visibleLedgerLines(detail.lines) : [];
  const primaryCurrency =
    amounts.length === 1
      ? amounts[0].currency
      : amounts.map((a) => a.currency).filter(Boolean).join(" · ") || "—";
  const summary = detail
    ? formatTransactionLine(
        {
          type: detail.type,
          reference: detail.reference,
          customerName: detail.customerName,
          walkInName: detail.walkInName,
          description: detail.description,
          amountSummary: amounts
            .map((a) => `${a.sign} ${a.currency} ${a.amount}`)
            .join(" · "),
          senderName: detail.senderName,
          receiverName: detail.receiverName,
        },
        t.txLine,
        (s) => statusLabel(t, s),
      )
    : "";
  const isTransfer = detail?.type.toUpperCase() === "TRANSFER";
  const transferAmount =
    isTransfer && amounts.length
      ? (() => {
          const pick =
            amounts.find((a) => a.sign === "−") ??
            amounts.find((a) => a.sign === "+") ??
            amounts[0];
          return pick ? `${pick.amount} ${pick.currency}`.trim() : "—";
        })()
      : null;

  function handlePrint() {
    if (!detail) return;
    document.body.classList.add("tx-printing");
    window.print();
    // Fallback if afterprint does not fire (some WebViews).
    window.setTimeout(() => document.body.classList.remove("tx-printing"), 1000);
  }

  return (
    <Modal
      title={
        detail
          ? t.customers.ledgerTitle.replace("{reference}", journalTxRef(detail))
          : t.nav.transactions
      }
      size="lg"
      onClose={onClose}
    >
      <div className="stack">
        {busy && !detail ? <p className="muted no-print">{t.common.loading}</p> : null}
        {error ? <p className="error no-print">{error}</p> : null}

        {detail ? (
          <>
            {/* Screen view */}
            <div className="tx-detail-screen no-print stack">
              <p style={{ margin: 0 }}>
                <TransactionLine
                  strong
                  style={{ fontSize: "var(--text-lg)" }}
                  input={{
                    type: detail.type,
                    reference: detail.reference,
                    status: detail.status === "POSTED" ? null : detail.status,
                    customerName: detail.customerName,
                    walkInName: detail.walkInName,
                    description: detail.description,
                    amountSummary: amounts
                      .map((a) => `${a.sign} ${a.currency} ${a.amount}`)
                      .join(" · "),
                    senderName: detail.senderName,
                    receiverName: detail.receiverName,
                  }}
                />
              </p>

              <div className="customer-form-grid">
                <div>
                  <span className="muted">{t.common.customer}</span>
                  <div>{detail.customerName ?? detail.walkInName ?? "—"}</div>
                </div>
                {detail.type.toUpperCase() === "TRANSFER" ? (
                  <>
                    <div>
                      <span className="muted">{t.common.sender}</span>
                      <div>{detail.senderName ?? detail.customerName ?? "—"}</div>
                    </div>
                    <div>
                      <span className="muted">{t.common.receiver}</span>
                      <div>{detail.receiverName ?? "—"}</div>
                    </div>
                  </>
                ) : null}
                <div>
                  <span className="muted">{t.common.type}</span>
                  <div>{transactionTypeLabel(t, detail.type)}</div>
                </div>
                <div>
                  <span className="muted">{t.common.amount}</span>
                  <div className="tx-detail-amounts">
                    {transferAmount ? (
                      <span className="tx-amt tx-amt-out">{transferAmount}</span>
                    ) : amounts.length === 0 ? (
                      "—"
                    ) : (
                      amounts.map((a, i) => (
                        <span key={`${a.sign}-${a.currency}-${a.amount}-${i}`}>
                          {i > 0 ? <span className="tx-line-sep"> · </span> : null}
                          <span
                            className={
                              a.sign === "+" ? "tx-amt tx-amt-in" : "tx-amt tx-amt-out"
                            }
                          >
                            {fmtAmountPart(a)}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="muted">{t.common.currency}</span>
                  <div>{primaryCurrency}</div>
                </div>
                <div>
                  <span className="muted">{t.common.reference}</span>
                  <div className="col-ref">{journalTxRef(detail)}</div>
                </div>
                <div>
                  <span className="muted">{t.common.date}</span>
                  <div>{formatWhen(detail.valueDate)}</div>
                </div>
                <div>
                  <span className="muted">{t.common.time}</span>
                  <div>{formatWhen(detail.postedAt ?? detail.createdAt)}</div>
                </div>
                <div>
                  <span className="muted">{t.common.status}</span>
                  <div>{statusLabel(t, detail.status)}</div>
                </div>
              </div>

              {detail.description ? (
                <p className="ledger-description-block" style={{ margin: 0 }}>
                  <span className="muted">{t.common.description}: </span>
                  <span className="ledger-description">{detail.description}</span>
                </p>
              ) : null}

              <h3 style={{ margin: "0.5rem 0 0", fontSize: "var(--text-lg)" }}>
                {t.common.ledgerEntries}
              </h3>
              {lines.length === 0 ? (
                <p className="muted">{t.common.noEntries}</p>
              ) : (
                <ul className="tx-detail-ledger">
                  {lines.map((line) => {
                    const inn = line.direction === "DEBIT";
                    const part: AmountPart = {
                      sign: inn ? "+" : "−",
                      currency: line.currencyCode,
                      amount: line.amount,
                    };
                    return (
                      <li key={line.id} className={inn ? "tx-line-in" : "tx-line-out"}>
                        <span className="tx-line-dot" aria-hidden="true" />
                        <span className={`amount-emphasis ${inn ? "money-in" : "money-out"}`}>
                          {fmtAmountPart(part)}
                        </span>
                        {line.memo ? (
                          <span className="muted tx-detail-memo"> · {line.memo}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Print-only receipt */}
            <div className="tx-print-receipt" aria-hidden="true">
              <h1 className="tx-print-brand">{businessName}</h1>
              <p className="tx-print-subtitle">{t.transactions.receipt}</p>
              <hr className="tx-print-rule" />
              <p className="tx-print-summary">{summary}</p>
              <hr className="tx-print-rule" />
              <div className="tx-print-row">
                <span>{t.common.reference}</span>
                <strong className="ltr-text tx-print-ref">
                  {journalTxRef(detail)}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.date}</span>
                <strong>{formatWhen(detail.valueDate)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.time}</span>
                <strong>{formatWhen(detail.postedAt ?? detail.createdAt)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.customer}</span>
                <strong>{detail.customerName ?? detail.walkInName ?? "—"}</strong>
              </div>
              {isTransfer ? (
                <>
                  <div className="tx-print-row">
                    <span>{t.common.sender}</span>
                    <strong>{detail.senderName ?? detail.customerName ?? "—"}</strong>
                  </div>
                  <div className="tx-print-row">
                    <span>{t.common.receiver}</span>
                    <strong>{detail.receiverName ?? "—"}</strong>
                  </div>
                </>
              ) : null}
              <div className="tx-print-row">
                <span>{t.common.type}</span>
                <strong>{transactionTypeLabel(t, detail.type)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.amount}</span>
                <strong className="tx-print-amount">
                  {transferAmount
                    ? transferAmount
                    : amounts.length
                      ? amounts.map((a) => fmtAmountPart(a)).join(" · ")
                      : "—"}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.currency}</span>
                <strong>{primaryCurrency}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.description}</span>
                <strong>{(detail.description ?? "").trim() || "—"}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.status}</span>
                <strong>{statusLabel(t, detail.status)}</strong>
              </div>
              <hr className="tx-print-rule" />
              <p className="tx-print-thanks">{t.transactions.thankYou}</p>
              <div className="tx-print-sig">
                <div>{t.common.customer}</div>
                <div>{t.users.cashier}</div>
              </div>
            </div>
          </>
        ) : null}

        <div className="row no-print" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          {detail ? (
            <button type="button" className="secondary" data-desk-action="print" onClick={handlePrint}>
              {t.common.print}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            {t.common.back}
          </button>
        </div>
      </div>
    </Modal>
  );
}
