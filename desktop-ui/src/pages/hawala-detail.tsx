import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";

import {
  archiveHawala,
  getAppInfo,
  getHawala,
  restoreHawala,
  type HawalaDetail,
} from "@desktop/api";
import {
  CompleteReceiveHawalaModal,
  isPendingReceiveHawala,
  payoutAmount,
} from "@desktop/components/complete-receive-hawala-modal";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import {
  formatAmountDisplay,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).replace("T", " ").slice(0, 19);
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (children == null || children === "" || children === "—") return null;
  return (
    <tr>
      <th>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

export function HawalaDetailPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const t = useT();
  const [detail, setDetail] = useState<HawalaDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setBusy(true);
    void getHawala(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleWhatsApp() {
    if (!detail) return;
    setWhatsappBusy(true);
    setError(null);
    try {
      const result = await sendHawalaWhatsAppToPartner(
        detail.id,
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
      setWhatsappBusy(false);
    }
  }

  async function handleArchive() {
    if (!session || !detail) return;
    if (!window.confirm(t.hawala.archiveConfirmSoft)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await archiveHawala({
        id: detail.id,
        actorUserId: session.userId,
        reason: null,
      });
      setDetail(updated);
      showSuccess(t.hawala.archivedSoftOk);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!session || !detail) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await restoreHawala({
        id: detail.id,
        actorUserId: session.userId,
      });
      setDetail(updated);
      showSuccess(t.hawala.restoredOk);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <div className="stack">
        <Link to="/hawala">{t.desk.backToHawala}</Link>
      </div>
    );
  }

  const archived = Boolean(detail?.deletedAt);
  const isReceive = detail?.direction.toUpperCase() === "RECEIVE";
  const isSend = detail?.direction.toUpperCase() === "SEND";
  const net = detail ? payoutAmount(detail) : "";
  const commission = detail?.ownCommissionAmount?.trim() || "";

  function handlePrint() {
    if (!detail) return;
    document.body.classList.add("tx-printing");
    window.print();
    window.setTimeout(() => document.body.classList.remove("tx-printing"), 1000);
  }

  const printSummary = detail
    ? `${detail.direction === "SEND" ? t.hawala.send : t.hawala.receive} · ${detail.amount} ${detail.currencyCode}`
    : "";

  return (
    <div className="stack">
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>
            {detail ? hawalaNumberRef(detail) : t.nav.hawala}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {detail
              ? `${detail.direction === "SEND" ? t.hawala.send : t.hawala.receive} · ${stamp(detail.valueDate)}`
              : t.common.loading}
          </p>
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {detail ? (
            <button type="button" className="secondary" onClick={handlePrint}>
              {t.common.print}
            </button>
          ) : null}
          <Link className="button-link secondary" to="/hawala">
            {t.desk.backToHawala}
          </Link>
        </div>
      </div>

      {error ? <p className="error no-print">{error}</p> : null}
      {busy && !detail ? <p className="muted">{t.common.loading}</p> : null}

      {detail ? (
        <>
          {archived ? (
            <p className="error no-print">{t.hawala.archiveNotice}</p>
          ) : null}

          <div className="row no-print hawala-detail-actions">
            {isPendingReceiveHawala(detail) && !archived ? (
              <button
                type="button"
                className="btn primary hawala-action-btn"
                disabled={busy || completeBusy}
                onClick={() => {
                  setCompleteError(null);
                  setCompleteOpen(true);
                }}
              >
                {t.hawala.completeHawala}
              </button>
            ) : null}
            {!archived ? (
              <button
                type="button"
                className="btn btn-action btn-action--whatsapp hawala-action-btn"
                disabled={busy || whatsappBusy}
                onClick={() => void handleWhatsApp()}
              >
                {whatsappBusy ? t.common.loading : t.hawala.sendWhatsApp}
              </button>
            ) : null}
            {!archived ? (
              <button
                type="button"
                className="secondary hawala-action-btn"
                data-desk-action="delete"
                disabled={busy}
                onClick={() => void handleArchive()}
              >
                {t.common.archive}
              </button>
            ) : (
              <button
                type="button"
                className="hawala-action-btn"
                disabled={busy}
                onClick={() => void handleRestore()}
              >
                {t.common.restore}
              </button>
            )}
          </div>

          <section className="section-card">
            <table className="hawala-detail-facts">
              <tbody>
                <DetailRow label={t.desk.hawalaNumber}>
                  <strong>{hawalaNumberRef(detail)}</strong>
                </DetailRow>
                <DetailRow label={t.common.date}>
                  {stamp(detail.valueDate)}
                </DetailRow>
                <DetailRow label={t.hawala.direction}>
                  {isSend ? t.hawala.send : t.hawala.receive}
                </DetailRow>
                <DetailRow label={t.common.status}>
                  <span className={statusBadgeClass(detail.status)}>
                    {statusLabel(t, detail.status)}
                  </span>
                  {archived ? (
                    <>
                      {" "}
                      <span className="badge badge-cancelled">
                        {t.common.archived}
                      </span>
                    </>
                  ) : null}
                </DetailRow>
                <DetailRow label={t.hawala.sender}>{detail.senderName}</DetailRow>
                <DetailRow label={t.hawala.receiver}>
                  {detail.receiverName}
                </DetailRow>
                {isReceive ? (
                  <DetailRow label={t.hawala.sourceCustomerAccount}>
                    {detail.partnerSarafi ||
                      detail.senderName ||
                      "—"}
                  </DetailRow>
                ) : null}
                {isSend && detail.receiverCustomerId ? (
                  <DetailRow label={t.hawala.receivingAccount}>
                    {detail.receiverName}
                  </DetailRow>
                ) : null}
                <DetailRow label={t.common.currency}>
                  {detail.currencyCode}
                </DetailRow>
                <DetailRow label={t.common.amount}>
                  <strong>
                    {formatAmountDisplay(detail.amount)} {detail.currencyCode}
                  </strong>
                </DetailRow>
                {commission ? (
                  <DetailRow label={t.desk.ownCommission}>
                    {formatAmountDisplay(commission)} {detail.currencyCode}
                  </DetailRow>
                ) : null}
                {net && net !== detail.amount ? (
                  <DetailRow
                    label={
                      isReceive ? t.hawala.netPayout : t.hawala.receive
                    }
                  >
                    {formatAmountDisplay(net)} {detail.currencyCode}
                  </DetailRow>
                ) : null}
                {detail.receiverNationalId ? (
                  <DetailRow label={t.common.nationalId}>
                    {detail.receiverNationalId}
                  </DetailRow>
                ) : null}
                {detail.receiverPhone ? (
                  <DetailRow label={t.common.phone}>
                    {detail.receiverPhone}
                  </DetailRow>
                ) : null}
                {detail.completedAt ? (
                  <DetailRow label={t.hawala.completedAt}>
                    {stamp(detail.completedAt)}
                  </DetailRow>
                ) : null}
                {detail.payoutDisplayRef || detail.payoutTransactionId ? (
                  <DetailRow label={t.hawala.payoutRecord}>
                    {detail.payoutDisplayRef || detail.payoutTransactionId}
                  </DetailRow>
                ) : null}
                {detail.createdByName ? (
                  <DetailRow label={t.desk.createdBy}>
                    {detail.createdByName}
                  </DetailRow>
                ) : null}
              </tbody>
            </table>
          </section>

          {createPortal(
            <div className="tx-print-receipt" aria-hidden="true">
              <h1 className="tx-print-brand">{businessName}</h1>
              <p className="tx-print-subtitle">{t.transactions.receipt}</p>
              <hr className="tx-print-rule" />
              <p className="tx-print-summary">{printSummary}</p>
              <hr className="tx-print-rule" />
              <div className="tx-print-row">
                <span>{t.common.reference}</span>
                <strong className="ltr-text tx-print-ref">
                  {hawalaNumberRef(detail)}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.hawala.direction}</span>
                <strong>
                  {isSend ? t.hawala.send : t.hawala.receive}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.status}</span>
                <strong>{statusLabel(t, detail.status)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.date}</span>
                <strong>{stamp(detail.valueDate)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.hawala.sender}</span>
                <strong>{detail.senderName}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.hawala.receiver}</span>
                <strong>{detail.receiverName}</strong>
              </div>
              {detail.receiverNationalId ? (
                <div className="tx-print-row">
                  <span>{t.common.nationalId}</span>
                  <strong>{detail.receiverNationalId}</strong>
                </div>
              ) : null}
              {detail.receiverPhone ? (
                <div className="tx-print-row">
                  <span>{t.common.phone}</span>
                  <strong>{detail.receiverPhone}</strong>
                </div>
              ) : null}
              <div className="tx-print-row">
                <span>{t.common.amount}</span>
                <strong className="tx-print-amount">
                  {detail.amount} {detail.currencyCode}
                </strong>
              </div>
              {commission ? (
                <div className="tx-print-row">
                  <span>{t.desk.ownCommission}</span>
                  <strong>{commission}</strong>
                </div>
              ) : null}
              {net && net !== detail.amount ? (
                <div className="tx-print-row">
                  <span>{t.hawala.netPayout}</span>
                  <strong>
                    {net} {detail.currencyCode}
                  </strong>
                </div>
              ) : null}
              {detail.completedAt ? (
                <div className="tx-print-row">
                  <span>{t.hawala.completedAt}</span>
                  <strong>{stamp(detail.completedAt)}</strong>
                </div>
              ) : null}
              <hr className="tx-print-rule" />
              <p className="tx-print-thanks">{t.transactions.thankYou}</p>
              <div className="tx-print-sig">
                <div>Customer</div>
                <div>Cashier</div>
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : null}

      {completeOpen && detail ? (
        <CompleteReceiveHawalaModal
          detail={detail}
          busy={completeBusy}
          error={completeError}
          onClose={() => {
            if (completeBusy) return;
            setCompleteOpen(false);
            setCompleteError(null);
          }}
          onCompleted={(updated) => {
            setDetail(updated);
            setCompleteOpen(false);
            setCompleteError(null);
            showSuccess(t.common.success);
          }}
          onError={setCompleteError}
          onBusy={setCompleteBusy}
        />
      ) : null}
      {successModal}
    </div>
  );
}
