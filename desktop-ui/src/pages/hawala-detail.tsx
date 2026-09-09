import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  archiveHawala,
  getAppInfo,
  getHawala,
  restoreHawala,
  updateHawalaMeta,
  type HawalaDetail,
} from "@desktop/api";
import { CompleteReceiveHawalaModal, isPendingReceiveHawala, payoutAmount } from "@desktop/components/complete-receive-hawala-modal";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";
import { statusLabel, purposeLabel, settlementLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import {
  statusBadgeClass,
  writeHawalaDraft,
} from "@desktop/pages/hawala-helpers";

const PURPOSES = [
  "Family",
  "Business",
  "Medical",
  "Education",
  "Salary",
  "Trade",
  "Investment",
  "Other",
] as const;

const PRIORITIES = ["NORMAL", "URGENT", "IMMEDIATE"] as const;

const SETTLEMENT_TYPES = [
  "Cash",
  "Partner Balance",
  "Customer Deposit",
  "Internal Adjustment",
] as const;

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).replace("T", " ").slice(0, 19);
}

type MetaForm = {
  purpose: string;
  priority: string;
  receiverName: string;
  receiverPhone: string;
  receiverNationalId: string;
  receiverAddress: string;
  receiverReference: string;
  partnerBranch: string;
  specialInstructions: string;
  expectedDeliveryDate: string;
  expectedDeliveryTime: string;
  settlementType: string;
  settlementNotes: string;
  internalNotes: string;
  customerNotes: string;
  privateNotes: string;
  notes: string;
};

function metaFromDetail(d: HawalaDetail): MetaForm {
  return {
    purpose: d.purpose ?? "Family",
    priority: (d.priority ?? "NORMAL").toUpperCase(),
    receiverName: d.receiverName ?? "",
    receiverPhone: d.receiverPhone ?? "",
    receiverNationalId: d.receiverNationalId ?? "",
    receiverAddress: d.receiverAddress ?? "",
    receiverReference: d.receiverReference ?? "",
    partnerBranch: d.partnerBranch ?? "",
    specialInstructions: d.specialInstructions ?? "",
    expectedDeliveryDate: d.expectedDeliveryDate
      ? String(d.expectedDeliveryDate).slice(0, 10)
      : "",
    expectedDeliveryTime: d.expectedDeliveryTime ?? "",
    settlementType: d.settlementType ?? "Cash",
    settlementNotes: d.settlementNotes ?? "",
    internalNotes: d.internalNotes ?? "",
    customerNotes: d.customerNotes ?? "",
    privateNotes: d.privateNotes ?? "",
    notes: d.notes ?? "",
  };
}

export function HawalaDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();
  const [detail, setDetail] = useState<HawalaDetail | null>(null);
  const [meta, setMeta] = useState<MetaForm | null>(null);
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  const [busy, setBusy] = useState(false);
  const metaFormRef = useRef<HTMLFormElement>(null);
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
        setMeta(metaFromDetail(d));
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
    if (
      !window.confirm(t.hawala.archiveConfirmSoft)
    ) {
      return;
    }
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

  async function handleSaveMeta(event: FormEvent) {
    event.preventDefault();
    if (!session || !detail || !meta) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateHawalaMeta({
        id: detail.id,
        actorUserId: session.userId,
        purpose: meta.purpose || null,
        priority: meta.priority || null,
        receiverName: meta.receiverName || null,
        receiverPhone: meta.receiverPhone || null,
        receiverNationalId: meta.receiverNationalId || null,
        receiverAddress: meta.receiverAddress || null,
        receiverReference: meta.receiverReference || null,
        partnerBranch: meta.partnerBranch || null,
        specialInstructions: meta.specialInstructions || null,
        expectedDeliveryDate: meta.expectedDeliveryDate || null,
        expectedDeliveryTime: meta.expectedDeliveryTime || null,
        settlementType: meta.settlementType || null,
        settlementNotes: meta.settlementNotes || null,
        notes: meta.notes || null,
        internalNotes: meta.internalNotes || null,
        customerNotes: meta.customerNotes || null,
        privateNotes: meta.privateNotes || null,
      });
      setDetail(updated);
      setMeta(metaFromDetail(updated));
      setEditing(false);
      showSuccess(t.hawala.detailsUpdated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleDuplicate() {
    if (!detail) return;
    writeHawalaDraft({
      direction: detail.direction === "RECEIVE" ? "RECEIVE" : "SEND",
      partnerId: detail.partnerSarafiId ?? undefined,
      partnerBranch: detail.partnerBranch ?? undefined,
      currencyCode: detail.currencyCode,
      amount: detail.amount,
      receiveCurrencyCode: detail.receiveCurrencyCode ?? undefined,
      receiveAmount: detail.receiveAmount ?? undefined,
      exchangeRate: detail.exchangeRate ?? undefined,
      purpose: detail.purpose ?? undefined,
      priority: detail.priority ?? undefined,
      cashWalletId: detail.cashWalletId,
      senderMode: detail.senderCustomerId ? "existing" : "walking",
      senderCustomerId: detail.senderCustomerId ?? undefined,
      senderName: detail.senderName,
      senderPhone: detail.senderPhone ?? undefined,
      senderNationalId: detail.senderNationalId ?? undefined,
      senderAddress: detail.senderAddress ?? undefined,
      receiverMode: detail.receiverCustomerId ? "existing" : "walking",
      receiverCustomerId: detail.receiverCustomerId ?? undefined,
      receiverName: detail.receiverName,
      receiverPhone: detail.receiverPhone ?? undefined,
      receiverNationalId: detail.receiverNationalId ?? undefined,
      receiverAddress: detail.receiverAddress ?? undefined,
      receiverReference: detail.receiverReference ?? undefined,
      country:
        detail.direction === "SEND"
          ? detail.destinationCountry
          : detail.originCountry,
      city:
        detail.direction === "SEND"
          ? detail.destinationCity
          : detail.originCity,
      originCity: detail.originCity,
      originCountry: detail.originCountry,
      destinationCity: detail.destinationCity,
      destinationCountry: detail.destinationCountry,
      specialInstructions: detail.specialInstructions ?? undefined,
      ownCommissionMode:
        (detail.ownCommissionMode as "FIXED" | "PERCENT") || "FIXED",
      ownCommission: detail.ownCommissionAmount ?? undefined,
      partnerCommissionMode:
        (detail.partnerCommissionMode as "FIXED" | "PERCENT") || "FIXED",
      partnerCommission: detail.partnerCommissionAmount ?? undefined,
      additionalCharges: detail.additionalCharges ?? undefined,
      discountAmount: detail.discountAmount ?? undefined,
      settlementType: detail.settlementType ?? undefined,
      settlementNotes: detail.settlementNotes ?? undefined,
      internalNotes: detail.internalNotes ?? undefined,
      customerNotes: detail.customerNotes ?? undefined,
      privateNotes: detail.privateNotes ?? undefined,
    });
    navigate("/hawala");
  }

  if (!id) {
    return (
      <div className="stack">
        <Link to="/hawala">{t.desk.backToHawala}</Link>
      </div>
    );
  }

  const archived = Boolean(detail?.deletedAt);

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
            {detail ? txDisplayRef(detail) : t.nav.hawala}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {detail
              ? `${detail.direction} · ${stamp(detail.valueDate)}`
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

      {detail && meta ? (
        <>
          {archived ? (
            <p className="error no-print">
              {t.hawala.archiveNotice}
            </p>
          ) : null}

          <div className="row no-print" style={{ alignItems: "center", gap: "0.75rem" }}>
            <span className={statusBadgeClass(detail.status)}>
              {statusLabel(t, detail.status)}
            </span>
            {detail.priority ? (
              <span className="muted">{t.common.priority}: {detail.priority}</span>
            ) : null}
            {archived ? <span className="badge badge-cancelled">{t.common.archived}</span> : null}
          </div>

          <div className="row no-print hawala-detail-actions">
            {detail && isPendingReceiveHawala(detail) && !archived ? (
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
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? t.desk.closeEdit : t.common.editAction}
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
            <button
              type="button"
              className="secondary hawala-action-btn"
              onClick={handleDuplicate}
            >
              {t.hawala.duplicate}
            </button>
          </div>

          <div className="hawala-layout">
            <div className="stack">
              <section className="section-card stack">
                <h2>{t.hawala.transfer}</h2>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.common.amount}</div>
                    <div
                      className={
                        detail.direction === "SEND" ? "money-out" : "money-in"
                      }
                      style={{ fontSize: "1.25rem", fontWeight: 700 }}
                    >
                      {detail.amount} {detail.currencyCode}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.hawala.direction}</div>
                    <div>{detail.direction === "SEND" ? t.hawala.send : t.hawala.receive}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.desk.purpose}</div>
                    <div>{purposeLabel(t, detail.purpose)}</div>
                  </div>
                </div>
                {detail.direction === "RECEIVE" ? (
                  <p style={{ margin: 0 }}>
                    <span className="muted">{t.hawala.sourceCustomerAccount}:</span>{" "}
                    {detail.partnerSarafi || "—"}
                  </p>
                ) : null}
                {detail.direction === "RECEIVE" && (detail.receiveAmount || detail.ownCommissionAmount) ? (
                  <p style={{ margin: 0 }}>
                    <span className="muted">{t.hawala.netPayout}:</span>{" "}
                    {payoutAmount(detail)} {detail.currencyCode}
                    {detail.ownCommissionAmount
                      ? ` · ${t.desk.ownCommission} ${detail.ownCommissionAmount}`
                      : ""}
                  </p>
                ) : null}
                {detail.direction === "RECEIVE" ? (
                  <p style={{ margin: 0 }}>
                    <span className="muted">{t.hawala.sourceCustomerAccount}:</span>{" "}
                    {detail.partnerSarafi || "—"}
                  </p>
                ) : null}
                {(detail.receiveAmount || detail.exchangeRate) && (
                  <p className="muted" style={{ margin: 0 }}>
                    {t.hawala.receive}: {detail.receiveAmount ?? "—"}{" "}
                    {detail.receiveCurrencyCode ?? ""}
                    {detail.exchangeRate
                      ? ` @ ${t.hawala.rate} ${detail.exchangeRate}`
                      : ""}
                  </p>
                )}
              </section>

              <section className="section-card stack">
                <h2>{t.hawala.parties}</h2>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.hawala.sender}</div>
                    <div>{detail.senderName}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {[detail.senderPhone, detail.senderNationalId]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    {detail.senderAddress ? (
                      <div className="muted">{detail.senderAddress}</div>
                    ) : null}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.hawala.receiver}</div>
                    <div>{detail.receiverName}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {[detail.receiverPhone, detail.receiverNationalId]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    {detail.receiverAddress ? (
                      <div className="muted">{detail.receiverAddress}</div>
                    ) : null}
                    {detail.receiverReference ? (
                      <div className="muted">
                        {t.hawala.referenceShort}: {detail.receiverReference}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="section-card stack">
                <h2>{t.hawala.routePartner}</h2>
                <p style={{ margin: 0 }}>
                  <strong>{detail.partnerSarafi}</strong>
                  {detail.partnerBranch ? ` · ${detail.partnerBranch}` : ""}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {detail.originCity}, {detail.originCountry} →{" "}
                  {detail.destinationCity}, {detail.destinationCountry}
                </p>
                {detail.specialInstructions ? (
                  <p style={{ margin: 0 }}>{detail.specialInstructions}</p>
                ) : null}
              </section>

              <section className="section-card stack">
                <h2>{t.hawala.commissionsSettlement}</h2>
                <table>
                  <tbody>
                    <tr>
                      <th>{t.desk.ownCommission}</th>
                      <td>
                        {detail.ownCommissionAmount ?? "—"}
                        {detail.ownCommissionMode
                          ? ` (${detail.ownCommissionMode})`
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>{t.partner.commission}</th>
                      <td>
                        {detail.partnerCommissionAmount ?? "—"}
                        {detail.partnerCommissionMode
                          ? ` (${detail.partnerCommissionMode})`
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>{t.hawala.additionalDiscount}</th>
                      <td>
                        {detail.additionalCharges ?? "0"} /{" "}
                        {detail.discountAmount ?? "0"}
                      </td>
                    </tr>
                    <tr>
                      <th>{t.partner.settlements}</th>
                      <td>
                        {settlementLabel(t, detail.settlementType)}
                        {detail.settlementNotes
                          ? ` — ${detail.settlementNotes}`
                          : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="section-card stack">
                <h2>{t.common.notes}</h2>
                <p style={{ margin: 0 }}>
                  <span className="muted">{t.common.internal}:</span>{" "}
                  {detail.internalNotes ?? "—"}
                </p>
                <p style={{ margin: 0 }}>
                  <span className="muted">{t.common.customer}:</span>{" "}
                  {detail.customerNotes ?? "—"}
                </p>
                <p style={{ margin: 0 }}>
                  <span className="muted">{t.common.private}:</span>{" "}
                  {detail.privateNotes ?? "—"}
                </p>
              </section>

              {editing && !archived ? (
                <form
                  ref={metaFormRef}
                  className="section-card stack no-print"
                  data-desk-form
                  onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
                    handleDeskFormKeyDown(e, {
                      busy,
                      onSubmit: () => metaFormRef.current?.requestSubmit(),
                    })
                  }
                  onSubmit={(e) => void handleSaveMeta(e)}
                >
                  <h2>{t.desk.editMeta}</h2>
                  <div className="row">
                    <label style={{ flex: 1 }}>
                      {t.desk.purpose}
                      <select
                        value={meta.purpose}
                        onChange={(e) =>
                          setMeta({ ...meta, purpose: e.target.value })
                        }
                      >
                        {PURPOSES.map((p) => (
                          <option key={p} value={p}>
                            {purposeLabel(t, p)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ flex: 1 }}>
                      {t.common.priority}
                      <select
                        value={meta.priority}
                        onChange={(e) =>
                          setMeta({ ...meta, priority: e.target.value })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    {t.hawala.receiverName}
                    <input
                      value={meta.receiverName}
                      onChange={(e) =>
                        setMeta({ ...meta, receiverName: e.target.value })
                      }
                    />
                  </label>
                  <div className="row">
                    <label style={{ flex: 1 }}>
                      {t.hawala.receiverPhone}
                      <input
                        value={meta.receiverPhone}
                        onChange={(e) =>
                          setMeta({ ...meta, receiverPhone: e.target.value })
                        }
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      {t.common.nationalId}
                      <input
                        value={meta.receiverNationalId}
                        onChange={(e) =>
                          setMeta({
                            ...meta,
                            receiverNationalId: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    {t.common.address}
                    <input
                      value={meta.receiverAddress}
                      onChange={(e) =>
                        setMeta({ ...meta, receiverAddress: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.hawala.receiverReference}
                    <input
                      value={meta.receiverReference}
                      onChange={(e) =>
                        setMeta({ ...meta, receiverReference: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.hawala.partnerBranch}
                    <input
                      value={meta.partnerBranch}
                      onChange={(e) =>
                        setMeta({ ...meta, partnerBranch: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.hawala.specialInstructions}
                    <textarea
                      rows={2}
                      value={meta.specialInstructions}
                      onChange={(e) =>
                        setMeta({
                          ...meta,
                          specialInstructions: e.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="row">
                    <label style={{ flex: 1 }}>
                      {t.hawala.expectedDeliveryDate}
                      <input
                        type="date"
                        value={meta.expectedDeliveryDate}
                        onChange={(e) =>
                          setMeta({
                            ...meta,
                            expectedDeliveryDate: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      {t.hawala.expectedDeliveryTime}
                      <input
                        type="time"
                        value={meta.expectedDeliveryTime}
                        onChange={(e) =>
                          setMeta({
                            ...meta,
                            expectedDeliveryTime: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    {t.hawala.settlementType}
                    <select
                      value={meta.settlementType}
                      onChange={(e) =>
                        setMeta({ ...meta, settlementType: e.target.value })
                      }
                    >
                      {SETTLEMENT_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {settlementLabel(t, s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.common.notes}
                    <textarea
                      rows={2}
                      value={meta.settlementNotes}
                      onChange={(e) =>
                        setMeta({ ...meta, settlementNotes: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.common.notes}
                    <textarea
                      rows={2}
                      value={meta.internalNotes}
                      onChange={(e) =>
                        setMeta({ ...meta, internalNotes: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.common.notes}
                    <textarea
                      rows={2}
                      value={meta.customerNotes}
                      onChange={(e) =>
                        setMeta({ ...meta, customerNotes: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t.common.notes}
                    <textarea
                      rows={2}
                      value={meta.privateNotes}
                      onChange={(e) =>
                        setMeta({ ...meta, privateNotes: e.target.value })
                      }
                    />
                  </label>
                  <div className="row">
                    <button type="submit" data-desk-action="save" disabled={busy}>
                      {busy ? t.common.saving : t.common.saveChanges}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setMeta(metaFromDetail(detail));
                        setEditing(false);
                      }}
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                </form>
              ) : null}

              {detail.direction === "RECEIVE" ? (
                <section className="section-card stack">
                  <h2>{t.common.status}</h2>
                  <p style={{ margin: 0 }}>
                    <span className={statusBadgeClass(detail.status)}>
                      {statusLabel(t, detail.status)}
                    </span>
                  </p>
                  {detail.completedAt ? (
                    <p style={{ margin: 0 }}>
                      <span className="muted">{t.hawala.completedAt}:</span>{" "}
                      {stamp(detail.completedAt)}
                    </p>
                  ) : null}
                  {detail.payoutDisplayRef || detail.payoutTransactionId ? (
                    <p style={{ margin: 0 }}>
                      <span className="muted">{t.hawala.payoutRecord}:</span>{" "}
                      {detail.payoutDisplayRef || detail.payoutTransactionId}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>

            <aside className="summary-sticky section-card stack">
              <h2>{t.desk.timeline}</h2>
              <div className="timeline">
                <div className="timeline-item">
                  <strong>{t.common.created}</strong>
                  <div className="muted">{stamp(detail.createdAt)}</div>
                  {detail.createdByName ? (
                    <div className="muted">{t.hawala.by} {detail.createdByName}</div>
                  ) : null}
                </div>
                {detail.sentAt ? (
                  <div className="timeline-item">
                    <strong>{t.status.sent}</strong>
                    <div className="muted">{stamp(detail.sentAt)}</div>
                  </div>
                ) : null}
                {detail.receivedAt ? (
                  <div className="timeline-item">
                    <strong>{t.status.received}</strong>
                    <div className="muted">{stamp(detail.receivedAt)}</div>
                  </div>
                ) : null}
                {detail.completedAt ? (
                  <div className="timeline-item">
                    <strong>{t.status.completed}</strong>
                    <div className="muted">{stamp(detail.completedAt)}</div>
                  </div>
                ) : null}
                {detail.cancelledAt ? (
                  <div className="timeline-item">
                    <strong>{t.status.cancelled}</strong>
                    <div className="muted">{stamp(detail.cancelledAt)}</div>
                  </div>
                ) : null}
                {detail.returnedAt ? (
                  <div className="timeline-item">
                    <strong>{t.status.returned}</strong>
                    <div className="muted">{stamp(detail.returnedAt)}</div>
                  </div>
                ) : null}
                {detail.events.map((ev) => (
                  <div className="timeline-item" key={ev.id}>
                    <strong>{ev.summary}</strong>
                    <div className="muted">{stamp(ev.createdAt)}</div>
                    {ev.actorName ? (
                      <div className="muted">{t.hawala.by} {ev.actorName}</div>
                    ) : null}
                    {ev.reason ? (
                      <div className="muted">{t.common.reason}: {ev.reason}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </aside>
          </div>

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
                  {txDisplayRef(detail)}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.hawala.direction}</span>
                <strong>
                  {detail.direction === "SEND" ? t.hawala.send : t.hawala.receive}
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
              {detail.senderPhone ? (
                <div className="tx-print-row">
                  <span>{t.common.phone}</span>
                  <strong>{detail.senderPhone}</strong>
                </div>
              ) : null}
              <div className="tx-print-row">
                <span>{t.hawala.receiver}</span>
                <strong>{detail.receiverName}</strong>
              </div>
              {detail.receiverPhone ? (
                <div className="tx-print-row">
                  <span>{t.hawala.receiverPhone}</span>
                  <strong>{detail.receiverPhone}</strong>
                </div>
              ) : null}
              <div className="tx-print-row">
                <span>{t.hawala.partner}</span>
                <strong>
                  {detail.partnerSarafi}
                  {detail.partnerBranch ? ` · ${detail.partnerBranch}` : ""}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.destination}</span>
                <strong>
                  {detail.destinationCity}, {detail.destinationCountry}
                </strong>
              </div>
              <div className="tx-print-row">
                <span>{t.common.amount}</span>
                <strong className="tx-print-amount">
                  {detail.amount} {detail.currencyCode}
                </strong>
              </div>
              {detail.receiveAmount ? (
                <div className="tx-print-row">
                  <span>{t.hawala.receive}</span>
                  <strong>
                    {detail.receiveAmount} {detail.receiveCurrencyCode ?? ""}
                  </strong>
                </div>
              ) : null}
              <div className="tx-print-row">
                <span>{t.desk.ownCommission}</span>
                <strong>{detail.ownCommissionAmount ?? "—"}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.partner.commission}</span>
                <strong>{detail.partnerCommissionAmount ?? "—"}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.desk.purpose}</span>
                <strong>{purposeLabel(t, detail.purpose)}</strong>
              </div>
              <div className="tx-print-row">
                <span>{t.partner.settlements}</span>
                <strong>{settlementLabel(t, detail.settlementType)}</strong>
              </div>
              {detail.createdByName ? (
                <div className="tx-print-row">
                  <span>{t.desk.createdBy}</span>
                  <strong>{detail.createdByName}</strong>
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
            setMeta(metaFromDetail(updated));
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
