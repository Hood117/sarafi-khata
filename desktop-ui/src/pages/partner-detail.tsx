import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  deletePartnerSettlement,
  getPartner,
  getPartnerCommissionSummary,
  getPartnerHawalaStats,
  listHawalaDesk,
  listPartnerSettlements,
  settlePartnerCommission,
  type HawalaListItem,
  type PartnerCommissionCurrencyRow,
  type PartnerCommissionSummary,
  type PartnerDetail,
  type PartnerHawalaStats,
  type PartnerSettlementRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { IconCash, IconDashboard, IconHawala } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { PartnerForm } from "@desktop/pages/partner-forms";
import { statusBadgeClass } from "@desktop/pages/hawala-helpers";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

type SettleKind = "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
type BalanceType = "COMMISSION" | "PRINCIPAL";
type PartnerTab = "overview" | "settlements" | "hawala";

function formatSettleAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round((n + Number.EPSILON) * 1e8) / 1e8;
  if (Math.abs(rounded) < 1e-9) return "0";
  return String(rounded);
}

/** Same netting rules as Rust `net_payable_receivable`. */
function netPayableReceivable(
  payable: number,
  receivable: number,
): { payable: number; receivable: number } {
  let p = payable;
  let r = receivable;
  if (r < -1e-9) {
    p -= r;
    r = 0;
  }
  if (p < -1e-9) {
    r -= p;
    p = 0;
  }
  p = Math.max(0, p);
  r = Math.max(0, r);
  const cleared = Math.min(p, r);
  if (cleared > 1e-9) {
    p -= cleared;
    r -= cleared;
  }
  return { payable: p, receivable: r };
}

function projectAfterSettle(
  payable: number,
  receivable: number,
  kind: SettleKind,
  amount: number,
): { payable: number; receivable: number } {
  let p = payable;
  let r = receivable;
  if (kind === "PAY_PARTNER") p -= amount;
  else r -= amount;
  return netPayableReceivable(p, r);
}

function balancePhrase(
  payable: number,
  receivable: number,
  currency: string,
  t: ReturnType<typeof useT>,
): { text: string; tone: "out" | "in" | "neutral" } {
  if (payable > 1e-9) {
    return {
      text: t.partner.balanceYouOwe
        .replace("{amount}", formatSettleAmount(payable))
        .replace("{currency}", currency),
      tone: "out",
    };
  }
  if (receivable > 1e-9) {
    return {
      text: t.partner.balanceTheyOwe
        .replace("{amount}", formatSettleAmount(receivable))
        .replace("{currency}", currency),
      tone: "in",
    };
  }
  return { text: t.partner.kataSettled, tone: "neutral" };
}

function BalanceTable({
  rows,
  onSettle,
  t,
}: {
  rows: PartnerCommissionCurrencyRow[];
  onSettle: (row: PartnerCommissionCurrencyRow, kind: SettleKind) => void;
  t: ReturnType<typeof useT>;
}) {
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    row: PartnerCommissionCurrencyRow;
  } | null>(null);

  if (rows.length === 0) return null;

  return (
    <div className="partner-balance-table-wrap">
      <table className="report-ledger partner-balance-table">
        <thead>
          <tr>
            <th>{t.common.currency}</th>
            <th>{t.partner.openBalanceLabel}</th>
            <th className="col-amount">{t.partner.youOwe}</th>
            <th className="col-amount">{t.partner.theyOwe}</th>
            <th>{t.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const payable = Number.parseFloat(row.payable) || 0;
            const receivable = Number.parseFloat(row.receivable) || 0;
            const canPay = payable > 1e-9;
            const canCollect = receivable > 1e-9;
            const summary = balancePhrase(payable, receivable, row.currencyCode, t);
            const toneClass =
              summary.tone === "out"
                ? "money-out"
                : summary.tone === "in"
                  ? "money-in"
                  : "money-neutral";
            return (
              <tr
                key={row.currencyId}
                className="is-clickable"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setRowMenu({ x: e.clientX, y: e.clientY, row });
                }}
              >
                <td>
                  <strong>{row.currencyCode}</strong>
                </td>
                <td className={`amount-emphasis ${toneClass}`}>{summary.text}</td>
                <td className={`col-amount amount-emphasis ${canPay ? "money-out" : "money-neutral"}`}>
                  {canPay ? row.payable : "—"}
                </td>
                <td
                  className={`col-amount amount-emphasis ${canCollect ? "money-in" : "money-neutral"}`}
                >
                  {canCollect ? row.receivable : "—"}
                </td>
                <td>
                  <div className="partner-settle-actions">
                    <button
                      type="button"
                      className="btn secondary partner-settle-btn partner-settle-btn--pay"
                      disabled={!canPay}
                      title={t.partner.payHim}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSettle(row, "PAY_PARTNER");
                      }}
                    >
                      {t.partner.payHim}
                    </button>
                    <button
                      type="button"
                      className="btn secondary partner-settle-btn partner-settle-btn--collect"
                      disabled={!canCollect}
                      title={t.partner.collectFromHim}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSettle(row, "COLLECT_FROM_PARTNER");
                      }}
                    >
                      {t.partner.collectFromHim}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            {
              id: "pay",
              label: t.partner.payHim,
              disabled: !(Number.parseFloat(rowMenu.row.payable) > 1e-9),
              onSelect: () => onSettle(rowMenu.row, "PAY_PARTNER"),
            },
            {
              id: "collect",
              label: t.partner.collectFromHim,
              disabled: !(Number.parseFloat(rowMenu.row.receivable) > 1e-9),
              onSelect: () => onSettle(rowMenu.row, "COLLECT_FROM_PARTNER"),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </div>
  );
}

export function PartnerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [commission, setCommission] = useState<PartnerCommissionSummary | null>(
    null,
  );
  const [hawalaStats, setHawalaStats] = useState<PartnerHawalaStats | null>(
    null,
  );
  const [transfers, setTransfers] = useState<HawalaListItem[]>([]);
  const [transfersTotal, setTransfersTotal] = useState(0);
  const [transfersPage, setTransfersPage] = useState(1);
  const transfersPageSize = 25;
  const [settlements, setSettlements] = useState<PartnerSettlementRow[]>([]);
  const [settlementsTotal, setSettlementsTotal] = useState(0);
  const [settlementsPage, setSettlementsPage] = useState(1);
  const settlementsPageSize = 25;
  const [settlementsBusy, setSettlementsBusy] = useState(false);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const settleLockRef = useRef(false);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PartnerTab>("overview");
  const { showSuccess, successModal } = useSuccessModal();

  const [settleRow, setSettleRow] = useState<PartnerCommissionCurrencyRow | null>(
    null,
  );
  const [settleKind, setSettleKind] = useState<SettleKind>("PAY_PARTNER");
  const [settleBalanceType, setSettleBalanceType] =
    useState<BalanceType>("PRINCIPAL");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNotes, setSettleNotes] = useState("");
  const [settleValueDate, setSettleValueDate] = useState(todayIso());
  const [replaceSettlementId, setReplaceSettlementId] = useState<string | null>(
    null,
  );
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settlementMenu, setSettlementMenu] = useState<{
    x: number;
    y: number;
    row: PartnerSettlementRow;
  } | null>(null);
  const settleFormRef = useRef<HTMLFormElement>(null);

  const reloadCommission = useCallback(async () => {
    if (!id) return;
    const summary = await getPartnerCommissionSummary(id);
    setCommission(summary);
  }, [id]);

  const reloadSettlements = useCallback(async () => {
    if (!id) return;
    setSettlementsBusy(true);
    setSettlementsError(null);
    try {
      const page = await listPartnerSettlements({
        partnerSarafiId: id,
        page: settlementsPage,
        pageSize: settlementsPageSize,
      });
      setSettlements(page.items);
      setSettlementsTotal(page.total);
    } catch (err: unknown) {
      setSettlements([]);
      setSettlementsTotal(0);
      setSettlementsError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setSettlementsBusy(false);
    }
  }, [id, settlementsPage]);

  async function handleDeleteSettlement(row: PartnerSettlementRow) {
    if (!id) return;
    const ok = window.confirm(
      `${t.partner.deleteSettlementConfirm}\n${row.amount} ${row.currencyCode}`,
    );
    if (!ok) return;
    setDeletingSettlementId(row.id);
    setSettlementsError(null);
    try {
      await deletePartnerSettlement({ id: row.id, partnerSarafiId: id });
      showSuccess(t.partner.deleteSettlementOk);
      await Promise.all([reloadCommission(), reloadSettlements()]);
    } catch (err: unknown) {
      setSettlementsError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setDeletingSettlementId(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      getPartner(id),
      getPartnerCommissionSummary(id),
      getPartnerHawalaStats(id),
    ])
      .then(([p, summary, stats]) => {
        if (cancelled) return;
        setPartner(p);
        setCommission(summary);
        setHawalaStats(stats);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, t.errors.loadGeneric));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t.errors.loadGeneric]);

  useEffect(() => {
    setTransfersPage(1);
    setSettlementsPage(1);
    setTab("overview");
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setListBusy(true);
    void listHawalaDesk({
      partnerSarafiId: id,
      page: transfersPage,
      pageSize: transfersPageSize,
      archiveFilter: "active",
      sort: "date_desc",
    })
      .then((page) => {
        if (cancelled) return;
        setTransfers(page.items);
        setTransfersTotal(page.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, t.errors.loadGeneric));
        }
      })
      .finally(() => {
        if (!cancelled) setListBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, transfersPage]);

  useEffect(() => {
    void reloadSettlements();
  }, [reloadSettlements]);

  function openSettle(
    row: PartnerCommissionCurrencyRow,
    kind: SettleKind,
    balanceType: BalanceType,
  ) {
    const max =
      kind === "PAY_PARTNER"
        ? Number.parseFloat(row.payable)
        : Number.parseFloat(row.receivable);
    setSettleRow(row);
    setSettleKind(kind);
    setSettleBalanceType(balanceType);
    setSettleAmount(Number.isFinite(max) && max > 0 ? String(max) : "");
    setSettleNotes("");
    setSettleValueDate(todayIso());
    setReplaceSettlementId(null);
    setSettleError(null);
  }

  function openEditSettlement(row: PartnerSettlementRow) {
    const kind: SettleKind = row.kind.toUpperCase().includes("COLLECT")
      ? "COLLECT_FROM_PARTNER"
      : "PAY_PARTNER";
    const balanceType: BalanceType =
      row.balanceType.toUpperCase() === "PRINCIPAL" ? "PRINCIPAL" : "COMMISSION";
    const liveRows =
      balanceType === "PRINCIPAL"
        ? commission?.principalByCurrency
        : commission?.byCurrency;
    const live = liveRows?.find((r) => r.currencyCode === row.currencyCode);
    const oldAmount = Number.parseFloat(row.amount) || 0;
    let payable = Number.parseFloat(live?.payable ?? "0") || 0;
    let receivable = Number.parseFloat(live?.receivable ?? "0") || 0;
    if (kind === "PAY_PARTNER") payable += oldAmount;
    else receivable += oldAmount;
    const restored = netPayableReceivable(payable, receivable);
    setSettleRow({
      currencyId: live?.currencyId ?? row.currencyCode,
      currencyCode: row.currencyCode,
      currencySymbol: live?.currencySymbol ?? null,
      payable: formatSettleAmount(restored.payable),
      receivable: formatSettleAmount(restored.receivable),
      openBalance: formatSettleAmount(restored.payable - restored.receivable),
      hawalaCount: live?.hawalaCount ?? 0,
    });
    setSettleKind(kind);
    setSettleBalanceType(balanceType);
    setSettleAmount(row.amount);
    setSettleNotes(row.notes ?? "");
    setSettleValueDate(String(row.valueDate).slice(0, 10) || todayIso());
    setReplaceSettlementId(row.id);
    setSettleError(null);
  }

  async function handleSettle(event: FormEvent) {
    event.preventDefault();
    if (!session?.userId || !id || !settleRow) return;
    if (!tryBeginSubmit(settleLockRef)) return;
    setSettleBusy(true);
    setSettleError(null);
    const paidAmount = settleAmount.trim();
    const currency = settleRow.currencyCode;
    const kind = settleKind;
    const beforePayable = Number.parseFloat(settleRow.payable) || 0;
    const beforeReceivable = Number.parseFloat(settleRow.receivable) || 0;
    const amountNum = Number.parseFloat(paidAmount) || 0;
    try {
      const result = await settlePartnerCommission({
        partnerSarafiId: id,
        kind,
        balanceType: settleBalanceType,
        currencyCode: currency,
        amount: paidAmount,
        notes: settleNotes || undefined,
        valueDate: settleValueDate || todayIso(),
        createdById: session.userId,
        replaceSettlementId: replaceSettlementId ?? undefined,
        settlementDestination:
          settleBalanceType === "COMMISSION" &&
          settleKind === "PAY_PARTNER" &&
          partner?.customerId
            ? "CUSTOMER_BALANCE"
            : undefined,
      });
      setSettleRow(null);
      setReplaceSettlementId(null);
      setTab("overview");
      await Promise.all([reloadCommission(), reloadSettlements()]);
      const after = projectAfterSettle(beforePayable, beforeReceivable, kind, amountNum);
      const afterPhrase = balancePhrase(after.payable, after.receivable, currency, t);
      const amountLabel = `${formatSettleAmount(amountNum)} ${currency}`;
      const successCore =
        kind === "PAY_PARTNER"
          ? t.partner.settleSuccessPay
              .replace("{amount}", amountLabel)
              .replace("{balance}", afterPhrase.text)
          : t.partner.settleSuccessCollect
              .replace("{amount}", amountLabel)
              .replace("{balance}", afterPhrase.text);
      const ref = txDisplayRef(result);
      showSuccess(ref ? `${successCore} · ${t.common.reference}: ${ref}` : successCore);
    } catch (err: unknown) {
      setSettleError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      endSubmit(settleLockRef);
      setSettleBusy(false);
    }
  }

  const principalRows = commission?.principalByCurrency ?? [];
  const commissionRows = commission?.byCurrency ?? [];
  const hasAnyBalance = principalRows.length > 0 || commissionRows.length > 0;

  if (!id) {
    return (
      <div className="stack">
        <Link to="/partners">{t.common.back}</Link>
      </div>
    );
  }

  return (
    <div className="stack partner-detail-page">
      <div
        className="row"
        style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.2rem" }}>
            {partner?.name ?? t.pages.partnerProfile}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {[partner?.city, partner?.country].filter(Boolean).join(", ") ||
              t.partner.information}
            {partner?.phone ? ` · ${partner.phone}` : ""}
          </p>
          {partner?.customerId ? (
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {t.partner.linkedCustomer}:{" "}
              <Link to={`/customers/${partner.customerId}`}>
                {partner.linkedCustomerName ?? t.partner.viewCustomerProfile}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: "0.4rem" }}>
          <button
            type="button"
            className="secondary"
            disabled={!partner || busy}
            onClick={() => setEditing(true)}
          >
            {t.partner.edit}
          </button>
          <Link className="button-link secondary" to="/partners">
            {t.common.back}
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !partner ? (
        <p className="muted">{t.partner.loadingPartner}</p>
      ) : null}

      {editing && partner ? (
        <Modal
          title={t.partner.edit}
          size="lg"
          onClose={() => setEditing(false)}
        >
          <PartnerForm
            partner={partner}
            onCancel={() => setEditing(false)}
            onUpdated={async (updated) => {
              setPartner(updated);
              setEditing(false);
              showSuccess(t.partner.savePartner);
              try {
                await reloadCommission();
              } catch (err: unknown) {
                setError(errorMessage(err, t.errors.loadGeneric));
              }
            }}
          />
        </Modal>
      ) : null}

      {hawalaStats && tab === "overview" ? (
        <div className="exchange-pnl-strip partner-stats-strip">
          <span>
            {t.common.total} <strong>{hawalaStats.total}</strong>
          </span>
          <span>
            {t.common.status} <strong>{hawalaStats.pending}</strong>
          </span>
          <span>
            {t.hawala.posted} <strong>{hawalaStats.completed}</strong>
          </span>
          <span>
            {t.hawala.cancelled} <strong>{hawalaStats.cancelled}</strong>
          </span>
          <span>
            {t.common.date}{" "}
            <strong>
              {hawalaStats.lastTransactionAt
                ? String(hawalaStats.lastTransactionAt).slice(0, 19)
                : "—"}
            </strong>
          </span>
        </div>
      ) : null}

      <div className="nav-row">
        <button
          type="button"
          className={tab === "overview" ? "nav-link active" : "nav-link"}
          onClick={() => setTab("overview")}
        >
          <span className="nav-link-icon">
            <IconDashboard />
          </span>
          <span className="nav-link-label">{t.dashboard.overview}</span>
        </button>
        <button
          type="button"
          className={tab === "settlements" ? "nav-link active" : "nav-link"}
          onClick={() => setTab("settlements")}
        >
          <span className="nav-link-icon">
            <IconCash />
          </span>
          <span className="nav-link-label">{t.partner.settlements}</span>
        </button>
        <button
          type="button"
          className={tab === "hawala" ? "nav-link active" : "nav-link"}
          onClick={() => setTab("hawala")}
        >
          <span className="nav-link-icon">
            <IconHawala />
          </span>
          <span className="nav-link-label">{t.partner.hawalaTab}</span>
        </button>
      </div>

      {tab === "overview" ? (
      <div className="stack partner-overview">
        {(partner?.openingKata?.length ?? 0) > 0 ? (
          <section className="section-card stack partner-opening-block">
            <h2 className="section-title">{t.openingKata.title}</h2>
            <div className="partner-balance-table-wrap">
              <table className="report-ledger partner-balance-table">
                <thead>
                  <tr>
                    <th>{t.openingKata.currency}</th>
                    <th className="col-amount">{t.openingKata.amount}</th>
                    <th>{t.openingKata.direction}</th>
                    <th>{t.openingKata.date}</th>
                    <th>{t.openingKata.description}</th>
                  </tr>
                </thead>
                <tbody>
                  {partner!.openingKata.map((line) => (
                    <tr key={line.transactionId}>
                      <td>
                        <strong>{line.currencyCode}</strong>
                      </td>
                      <td className="col-amount amount-emphasis money-neutral">
                        {line.amount}
                      </td>
                      <td>
                        {line.direction === "TAKE"
                          ? t.openingKata.partnerTakes
                          : t.openingKata.partnerGives}
                      </td>
                      <td>{line.valueDate}</td>
                      <td>{line.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="section-card stack">
          <div className="partner-section-head">
            <h2 className="section-title">{t.partner.kataTitle}</h2>
            <p className="muted partner-section-hint">{t.partner.kataHint}</p>
          </div>
          {!hasAnyBalance ? (
            <p className="muted">{t.partner.noCommissionYet}</p>
          ) : (
            <div className="stack partner-kata-sections">
              {principalRows.length > 0 ? (
                <div className="stack partner-kata-section">
                  <h3 className="partner-subsection-title">{t.partner.hawalaPrincipal}</h3>
                  <BalanceTable
                    rows={principalRows}
                    t={t}
                    onSettle={(row, kind) => openSettle(row, kind, "PRINCIPAL")}
                  />
                </div>
              ) : null}

              {commissionRows.length > 0 ? (
                <div className="stack partner-kata-section">
                  <h3 className="partner-subsection-title">{t.partner.hawalaCommission}</h3>
                  <BalanceTable
                    rows={commissionRows}
                    t={t}
                    onSettle={(row, kind) => openSettle(row, kind, "COMMISSION")}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
      ) : null}

      {tab === "settlements" ? (
      <div className="section-card stack" id="partner-settlement-history">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{t.partner.settlementHistory}</h2>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>
              {t.partner.settlementHistoryHint}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            data-desk-action="refresh"
            data-desk-primary
            disabled={settlementsBusy}
            onClick={() => void reloadSettlements()}
          >
            {t.desk.refresh}
          </button>
        </div>
        {settlementsError ? <p className="error">{settlementsError}</p> : null}
        {settlementsBusy && settlements.length === 0 ? (
          <p className="muted">{t.common.loading}</p>
        ) : null}
        {settlements.length === 0 && !settlementsBusy ? (
          <p className="muted">{t.partner.noSettlementsYet}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.common.type}</th>
                  <th>{t.partner.settleWhat}</th>
                  <th>{t.common.currency}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.reference}</th>
                  <th>{t.common.notes}</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((row) => {
                  const isCollect = row.kind.toUpperCase().includes("COLLECT");
                  const isPrincipal = row.balanceType.toUpperCase() === "PRINCIPAL";
                  return (
                    <tr
                      key={row.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSettlementMenu({ x: e.clientX, y: e.clientY, row });
                      }}
                    >
                      <td>{String(row.valueDate).slice(0, 10)}</td>
                      <td>
                        {isCollect ? t.partner.collectFromHim : t.partner.payHim}
                      </td>
                      <td>
                        {isPrincipal
                          ? t.partner.settleWhatPrincipal
                          : t.partner.settleWhatCommission}
                      </td>
                      <td>{row.currencyCode}</td>
                      <td
                        className={`amount-emphasis ${isCollect ? "money-in" : "money-out"}`}
                        style={{ fontWeight: 650 }}
                      >
                        {row.amount}
                      </td>
                      <td>{txDisplayRef(row) || "—"}</td>
                      <td>{row.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={settlementsPage}
          pageSize={settlementsPageSize}
          total={settlementsTotal}
          busy={settlementsBusy}
          onPageChange={setSettlementsPage}
        />
      </div>
      ) : null}

      {tab === "hawala" ? (
      <div className="section-card stack">
        <div>
          <h2 style={{ margin: 0 }}>{t.partner.hawalaTab}</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            {t.partner.showingHawala.replace("{count}", String(transfersTotal))}
          </p>
        </div>
        {listBusy && transfers.length === 0 ? (
          <p className="muted">{t.common.loading}</p>
        ) : null}
        {transfers.length === 0 && !listBusy ? (
          <p className="muted">{t.partner.noHawalaYet}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.common.referenceNumber}</th>
                  <th>{t.common.date}</th>
                  <th>{t.common.type}</th>
                  <th>{t.common.sender}</th>
                  <th>{t.common.receiver}</th>
                  <th>{t.common.to}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((row) => (
                  <tr
                    key={row.id}
                    className="customer-row-clickable"
                    onClick={() => navigate(`/hawala/${row.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/hawala/${row.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${t.common.view} ${txDisplayRef(row)}`}
                  >
                    <td>
                      <Link
                        to={`/hawala/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {txDisplayRef(row)}
                      </Link>
                    </td>
                    <td>{String(row.valueDate).slice(0, 10)}</td>
                    <td>{row.direction}</td>
                    <td>{row.senderName ?? "—"}</td>
                    <td>{row.receiverName ?? "—"}</td>
                    <td>
                      {[row.destinationCity, row.destinationCountry]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className={row.direction === "SEND" ? "money-out" : "money-in"}>
                      {row.amount} {row.currencyCode}
                    </td>
                    <td>
                      <span className={statusBadgeClass(row.status)}>
                        {statusLabel(t, row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={transfersPage}
          pageSize={transfersPageSize}
          total={transfersTotal}
          busy={listBusy}
          onPageChange={setTransfersPage}
        />
      </div>
      ) : null}

      {settleRow ? (
        <Modal
          title={
            replaceSettlementId
              ? `${t.partner.editSettlement} — ${settleRow.currencyCode}`
              : settleKind === "PAY_PARTNER"
                ? `${t.partner.payHim} — ${settleRow.currencyCode}`
                : `${t.partner.collectFromHim} — ${settleRow.currencyCode}`
          }
          onClose={() => !settleBusy && setSettleRow(null)}
        >
          <form
            ref={settleFormRef}
            className="stack"
            data-desk-form
            onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
              handleDeskFormKeyDown(e, {
                busy: settleBusy,
                onSubmit: () => settleFormRef.current?.requestSubmit(),
              })
            }
            onSubmit={(e) => void handleSettle(e)}
          >
            {(() => {
              const payable = Number.parseFloat(settleRow.payable) || 0;
              const receivable = Number.parseFloat(settleRow.receivable) || 0;
              const amountNum = Number.parseFloat(settleAmount) || 0;
              const current = balancePhrase(
                payable,
                receivable,
                settleRow.currencyCode,
                t,
              );
              const after =
                amountNum > 0
                  ? projectAfterSettle(payable, receivable, settleKind, amountNum)
                  : { payable, receivable };
              const afterLabel = balancePhrase(
                after.payable,
                after.receivable,
                settleRow.currencyCode,
                t,
              );
              const currentTone =
                current.tone === "out"
                  ? "money-out"
                  : current.tone === "in"
                    ? "money-in"
                    : "money-neutral";
              const afterTone =
                afterLabel.tone === "out"
                  ? "money-out"
                  : afterLabel.tone === "in"
                    ? "money-in"
                    : "money-neutral";
              const paymentTone =
                settleKind === "PAY_PARTNER" ? "money-out" : "money-in";
              return (
                <div className="partner-settle-summary">
                  <p className="muted partner-settle-summary-type">
                    {settleBalanceType === "PRINCIPAL"
                      ? t.partner.settleWhatPrincipal
                      : t.partner.settleWhatCommission}
                  </p>
                  <div className="partner-settle-summary-row">
                    <span>{t.partner.settleCurrentBalance}</span>
                    <strong className={currentTone}>{current.text}</strong>
                  </div>
                  <div className="partner-settle-summary-row">
                    <span>
                      {settleKind === "PAY_PARTNER"
                        ? t.partner.paidToHim
                        : t.partner.collectedFromHim}
                    </span>
                    <strong className={paymentTone}>
                      {amountNum > 0
                        ? `${formatSettleAmount(amountNum)} ${settleRow.currencyCode}`
                        : "—"}
                    </strong>
                  </div>
                  <div className="partner-settle-summary-row partner-settle-summary-row--after">
                    <span>{t.partner.settleAfterBalance}</span>
                    <strong className={afterTone}>{afterLabel.text}</strong>
                  </div>
                </div>
              );
            })()}
            {settleBalanceType === "COMMISSION" &&
            settleKind === "PAY_PARTNER" &&
            partner?.customerId ? (
              <p className="muted partner-settle-credit-hint">
                {t.partner.settleCreditCustomerHint.replace(
                  "{name}",
                  partner.linkedCustomerName ?? partner.name,
                )}
              </p>
            ) : null}
            <label>
              {t.partner.settleAmount} *
              <input
                required
                autoFocus
                inputMode="decimal"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
              />
            </label>
            <label>
              {t.common.date}
              <input
                type="date"
                value={settleValueDate}
                onChange={(e) => setSettleValueDate(e.target.value)}
              />
            </label>
            <label>
              {t.common.notes}
              <input
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
              />
            </label>
            <ModalErrorBanner message={settleError} />
            <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={settleBusy}
                onClick={() => setSettleRow(null)}
              >
                {t.common.cancel}
              </button>
              <button type="submit" disabled={settleBusy || !settleAmount.trim()}>
                {settleBusy
                  ? t.common.saving
                  : replaceSettlementId
                    ? t.common.saveChanges
                    : settleKind === "PAY_PARTNER"
                      ? t.partner.payHim
                      : t.partner.collectFromHim}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {settlementMenu ? (
        <DeskContextMenu
          x={settlementMenu.x}
          y={settlementMenu.y}
          items={[
            {
              id: "edit",
              label: t.partner.editSettlement,
              disabled: deletingSettlementId === settlementMenu.row.id,
              onSelect: () => openEditSettlement(settlementMenu.row),
            },
            {
              id: "delete",
              label:
                deletingSettlementId === settlementMenu.row.id
                  ? t.common.saving
                  : t.common.delete,
              danger: true,
              disabled: deletingSettlementId === settlementMenu.row.id,
              onSelect: () => void handleDeleteSettlement(settlementMenu.row),
            },
          ]}
          onClose={() => setSettlementMenu(null)}
        />
      ) : null}
      {successModal}
    </div>
  );
}
