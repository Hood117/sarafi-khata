import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveHawala,
  getHawala,
  restoreHawala,
  setHawalaStatus,
  updateHawalaMeta,
  type HawalaDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { statusLabel, purposeLabel, settlementLabel } from "@desktop/lib/i18n-labels";
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
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();
  const [detail, setDetail] = useState<HawalaDetail | null>(null);
  const [meta, setMeta] = useState<MetaForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState("");

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

  async function changeStatus(status: string) {
    if (!session || !detail) return;
    if (detail.status === "COMPLETED" && status === "CANCELLED") {
      setError(t.hawala.completedCannotCancel);
      return;
    }
    const needsReason =
      status === "CANCELLED" || status === "RETURNED";
    if (needsReason && !statusReason.trim()) {
      setError(t.desk.reasonCancelReturn);
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const updated = await setHawalaStatus({
        id: detail.id,
        status,
        reason: statusReason.trim() || null,
        actorUserId: session.userId,
      });
      setDetail(updated);
      setMeta(metaFromDetail(updated));
      setOk(
        t.hawala.statusSetTo.replace("{status}", statusLabel(t, status)),
      );
      setStatusReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
        reason: statusReason.trim() || null,
      });
      setDetail(updated);
      setOk(t.hawala.archivedSoftOk);
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
      setOk(t.hawala.restoredOk);
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
    setOk(null);
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
      setOk(t.hawala.detailsUpdated);
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
  const status = detail?.status?.toUpperCase() ?? "";

  const canSent = !archived && status === "PENDING";
  const canReceived =
    !archived && (status === "SENT" || status === "PENDING");
  const canCompleted =
    !archived && (status === "SENT" || status === "RECEIVED");
  const canCancel = !archived && (status === "PENDING" || status === "SENT");
  const canReturn =
    !archived &&
    ["PENDING", "SENT", "RECEIVED", "COMPLETED"].includes(status);

  return (
    <div className="stack">
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>
            {detail?.reference ?? t.nav.hawala}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {detail
              ? `${detail.direction} · ${stamp(detail.valueDate)}`
              : t.common.loading}
          </p>
        </div>
        <Link className="button-link secondary" to="/hawala">
          {t.desk.backToHawala}
        </Link>
      </div>

      {error ? <p className="error no-print">{error}</p> : null}
      {ok ? <p className="ok no-print">{ok}</p> : null}
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

          <div className="row no-print" style={{ flexWrap: "wrap" }}>
            {canSent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void changeStatus("SENT")}
              >
                {t.hawala.markSent}
              </button>
            ) : null}
            {canReceived && status === "SENT" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void changeStatus("RECEIVED")}
              >
                {t.hawala.markReceived}
              </button>
            ) : null}
            {canCompleted ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void changeStatus("COMPLETED")}
              >
                {t.hawala.markCompleted}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void changeStatus("CANCELLED")}
              >
                {t.common.cancel}
              </button>
            ) : null}
            {canReturn ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void changeStatus("RETURNED")}
              >
                {t.hawala.return}
              </button>
            ) : null}
            {!archived ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleArchive()}
              >
                {t.common.archive}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRestore()}
              >
                {t.common.restore}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={handleDuplicate}
            >
              {t.hawala.duplicate}
            </button>
            {!archived ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? t.desk.closeEdit : t.desk.editMeta}
              </button>
            ) : null}
          </div>

          {(canCancel || canReturn) && !archived ? (
            <label className="no-print">
              {t.hawala.reasonCancelReturnLabel}
              <input
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={t.hawala.reasonCancelReturnPlaceholder}
              />
            </label>
          ) : null}

          <div className="hawala-layout">
            <div className="stack">
              <section className="section-card stack">
                <h2>{t.hawala.transfer}</h2>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div className="muted">{t.common.amount}</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
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
                  className="section-card stack no-print"
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
                    <button type="submit" disabled={busy}>
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
        </>
      ) : null}
    </div>
  );
}
