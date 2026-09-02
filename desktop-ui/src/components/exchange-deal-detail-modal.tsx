import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

import {
  getAppInfo,
  getExchangeDealDetail,
  type ExchangeDealDetail,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19).replace("T", " ") : value.slice(0, 10);
}

function partyName(detail: ExchangeDealDetail): string {
  return (detail.customerName ?? detail.walkInName ?? "—").trim() || "—";
}

function sideLabel(t: ReturnType<typeof useT>, side: string): string {
  return side === "BUY_HIGH" ? t.desk.buyHigh : side === "SELL_HIGH" ? t.desk.sellHigh : side;
}

/** Row props for clickable exchange-deal tables (keyboard + mouse). */
export function clickableDealRowProps(onOpen: () => void) {
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

export function useExchangeDealDetailModal() {
  const [detail, setDetail] = useState<ExchangeDealDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (dealOrTxId: string) => {
    const id = dealOrTxId.trim();
    if (!id) return;
    setDetail(null);
    setBusy(true);
    setError(null);
    try {
      setDetail(await getExchangeDealDetail(id));
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
  detail: ExchangeDealDetail | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
};

/**
 * Shared exchange deal detail modal — Exchange page recent deals + reports.
 */
export function ExchangeDealDetailModal({
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

  const summary = detail
    ? `${partyName(detail)} exchanged ${detail.fromAmount} ${detail.fromCurrency} → ${detail.toAmount} ${detail.toCurrency}`
    : "";
  const pnlLabel = detail
    ? detail.isProfit
      ? t.desk.profit
      : t.desk.loss
    : "";

  function handlePrint() {
    if (!detail) return;
    document.body.classList.add("tx-printing");
    window.print();
    window.setTimeout(() => document.body.classList.remove("tx-printing"), 1000);
  }

  return (
    <Modal
      title={
        detail
          ? t.customers.ledgerTitle.replace("{reference}", txDisplayRef(detail))
          : t.nav.exchange
      }
      size="lg"
      onClose={onClose}
    >
      <div className="stack">
        {busy && !detail ? <p className="muted no-print">{t.common.loading}</p> : null}
        {error ? <p className="error no-print">{error}</p> : null}

        {detail ? (
          <>
            <div className="tx-detail-screen no-print stack">
              <p style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600 }}>
                {summary}
              </p>

              <div className="customer-form-grid">
                <div>
                  <span className="muted">{t.common.reference}</span>
                  <div className="col-ref">{txDisplayRef(detail)}</div>
                </div>
                <div>
                  <span className="muted">{t.common.customer}</span>
                  <div>{partyName(detail)}</div>
                </div>
                <div>
                  <span className="muted">{t.desk.give}</span>
                  <div>
                    <span className="tx-amt tx-amt-out">
                      {detail.fromAmount} {detail.fromCurrency}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="muted">{t.desk.receive}</span>
                  <div>
                    <span className="tx-amt tx-amt-in">
                      {detail.toAmount} {detail.toCurrency}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="muted">{t.desk.deal}</span>
                  <div>{detail.dealRate}</div>
                </div>
                <div>
                  <span className="muted">{t.desk.board}</span>
                  <div>{detail.boardRate ?? "—"}</div>
                </div>
                <div>
                  <span className="muted">{t.desk.side}</span>
                  <div>{sideLabel(t, detail.side)}</div>
                </div>
                <div>
                  <span className="muted">{pnlLabel}</span>
                  <div
                    style={{
                      fontWeight: 700,
                      color: detail.isProfit ? undefined : "var(--money-out)",
                    }}
                  >
                    {detail.profitAmount} {detail.profitCurrency}
                  </div>
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
            </div>

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
                <span>{t.common.time}</span>
                <strong>{formatWhen(detail.postedAt ?? detail.createdAt)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.customer}</span>
                <strong>{partyName(detail)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.type}</span>
                <strong>{t.nav.exchange}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.side}</span>
                <strong>{sideLabel(t, detail.side)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.give}</span>
                <strong className="tx-print-amount">
                  {detail.fromAmount} {detail.fromCurrency}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.receive}</span>
                <strong className="tx-print-amount">
                  {detail.toAmount} {detail.toCurrency}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.deal}</span>
                <strong>{detail.dealRate}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.board}</span>
                <strong>{detail.boardRate ?? "—"}</strong>
              </div>
              <div className="tx-print-row">
                <span>{pnlLabel}</span>
                <strong>
                  {detail.profitAmount} {detail.profitCurrency}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.status}</span>
                <strong>{statusLabel(t, detail.status)}</strong>
              </div>
              {detail.description ? (
                <div className="tx-print-row">
                  <span>{t.common.description}</span>
                  <strong>{detail.description}</strong>
                </div>
              ) : null}
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
            <button type="button" className="secondary" onClick={handlePrint}>
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
