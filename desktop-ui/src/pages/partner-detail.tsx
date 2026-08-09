import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  getPartner,
  getPartnerCommissionSummary,
  getPartnerHawalaStats,
  listHawalaDesk,
  listWalletsPage,
  settlePartnerCommission,
  updatePartner,
  type HawalaListItem,
  type PartnerCommissionCurrencyRow,
  type PartnerCommissionSummary,
  type PartnerDetail,
  type PartnerHawalaStats,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { statusBadgeClass } from "@desktop/pages/hawala-helpers";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";

type SettleKind = "PAY_PARTNER" | "COLLECT_FROM_PARTNER";

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
  const [cashWallets, setCashWallets] = useState<WalletListItem[]>([]);
  const [transfers, setTransfers] = useState<HawalaListItem[]>([]);
  const [transfersTotal, setTransfersTotal] = useState(0);
  const [transfersPage, setTransfersPage] = useState(1);
  const transfersPageSize = 25;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [settleRow, setSettleRow] = useState<PartnerCommissionCurrencyRow | null>(
    null,
  );
  const [settleKind, setSettleKind] = useState<SettleKind>("PAY_PARTNER");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleWalletId, setSettleWalletId] = useState("");
  const [settleNotes, setSettleNotes] = useState("");
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const reloadCommission = useCallback(async () => {
    if (!id) return;
    const summary = await getPartnerCommissionSummary(id);
    setCommission(summary);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      getPartner(id),
      getPartnerCommissionSummary(id),
      getPartnerHawalaStats(id),
      listWalletsPage({ pageSize: 100, activeOnly: true }),
    ])
      .then(([p, summary, stats, wallets]) => {
        if (cancelled) return;
        setPartner(p);
        setCommission(summary);
        setHawalaStats(stats);
        const cash = wallets.items.filter(
          (w) => w.type === "TILL" || w.type === "VAULT",
        );
        setCashWallets(cash);
        setSettleWalletId((prev) => prev || cash[0]?.id || "");
        setName(p.name);
        setPhone(p.phone ?? "");
        setCity(p.city ?? "");
        setCountry(p.country ?? "");
        setNotes(p.notes ?? "");
        setIsActive(p.isActive);
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

  useEffect(() => {
    setTransfersPage(1);
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
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setListBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, transfersPage]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!partner) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const updated = await updatePartner({
        id: partner.id,
        name,
        phone: phone || null,
        city: city || null,
        country: country || null,
        notes: notes || null,
        isActive,
      });
      setPartner(updated);
      setOk(t.partner.savePartner);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function openSettle(row: PartnerCommissionCurrencyRow, kind: SettleKind) {
    const max =
      kind === "PAY_PARTNER"
        ? Number.parseFloat(row.payable)
        : Number.parseFloat(row.receivable);
    setSettleRow(row);
    setSettleKind(kind);
    setSettleAmount(
      Number.isFinite(max) && max > 0 ? String(max) : "",
    );
    setSettleNotes("");
    setSettleError(null);
  }

  async function handleSettle(event: FormEvent) {
    event.preventDefault();
    if (!session?.userId || !id || !settleRow) return;
    setSettleBusy(true);
    setSettleError(null);
    try {
      const result = await settlePartnerCommission({
        partnerSarafiId: id,
        kind: settleKind,
        currencyCode: settleRow.currencyCode,
        amount: settleAmount,
        cashWalletId: settleWalletId,
        notes: settleNotes || undefined,
        valueDate: todayIso(),
        createdById: session.userId,
      });
      setOk(
        settleKind === "PAY_PARTNER"
          ? t.partner.payCommissionTo.replace("{name}", result.reference)
          : t.partner.collectCommissionFrom.replace("{name}", result.reference),
      );
      setSettleRow(null);
      await reloadCommission();
    } catch (err: unknown) {
      setSettleError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettleBusy(false);
    }
  }

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
        </div>
        <div className="row" style={{ gap: "0.4rem" }}>
          <button
            type="button"
            className="secondary"
            disabled={!partner || busy}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? t.common.cancel : t.partner.edit}
          </button>
          <Link className="button-link secondary" to="/partners">
            {t.common.back}
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}
      {busy && !partner ? (
        <p className="muted">{t.partner.loadingPartner}</p>
      ) : null}

      {partner && editing ? (
        <form className="section-card stack" onSubmit={(e) => void handleSave(e)}>
          <h2 style={{ margin: 0 }}>{t.partner.edit}</h2>
          <div className="exchange-fields-grid">
            <label className="exchange-span-2">
              {t.common.name} *
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {t.common.phone}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              {t.common.city}
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label>
              {t.common.country}
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </label>
            <label>
              {t.common.notes}
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {t.common.active}
          </label>
          <div className="row" style={{ gap: "0.5rem" }}>
            <button type="submit" disabled={busy}>
              {busy ? t.common.saving : t.partner.savePartner}
            </button>
          </div>
        </form>
      ) : null}

      {hawalaStats ? (
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

      <div className="section-card stack">
        <div>
          <h2 style={{ margin: 0 }}>{t.partner.hawalaCommission}</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {t.partner.commissionFormHint}
          </p>
        </div>
        {!commission || commission.byCurrency.length === 0 ? (
          <p className="muted">{t.partner.noCommissionYet}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.common.currency}</th>
                  <th>{t.partner.youOwe}</th>
                  <th>{t.partner.theyOwe}</th>
                  <th>{t.common.net}</th>
                  <th>{t.nav.hawala}</th>
                  <th>{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {commission.byCurrency.map((row) => {
                  const payable = Number.parseFloat(row.payable) || 0;
                  const receivable = Number.parseFloat(row.receivable) || 0;
                  return (
                    <tr key={row.currencyId}>
                      <td>
                        <strong>{row.currencyCode}</strong>
                      </td>
                      <td>{row.payable}</td>
                      <td>{row.receivable}</td>
                      <td>{row.openBalance}</td>
                      <td>{row.hawalaCount}</td>
                      <td>
                        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="secondary"
                            disabled={payable <= 0}
                            onClick={() => openSettle(row, "PAY_PARTNER")}
                          >
                            {t.partner.payHim}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={receivable <= 0}
                            onClick={() => openSettle(row, "COLLECT_FROM_PARTNER")}
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
          </div>
        )}
      </div>

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
                    aria-label={`${t.common.view} ${row.reference}`}
                  >
                    <td>
                      <Link
                        to={`/hawala/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.reference}
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
                    <td>
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

      {settleRow ? (
        <Modal
          title={
            settleKind === "PAY_PARTNER"
              ? `${t.partner.payHim} — ${settleRow.currencyCode}`
              : `${t.partner.collectFromHim} — ${settleRow.currencyCode}`
          }
          onClose={() => !settleBusy && setSettleRow(null)}
        >
          <form className="stack" onSubmit={(e) => void handleSettle(e)}>
            <p className="muted" style={{ margin: 0 }}>
              {settleKind === "PAY_PARTNER"
                ? t.partner.openBalanceSettle
                    .replace("{amount}", settleRow.payable)
                    .replace("{currency}", settleRow.currencyCode)
                : t.partner.openBalanceSettle
                    .replace("{amount}", settleRow.receivable)
                    .replace("{currency}", settleRow.currencyCode)}
            </p>
            <label>
              {t.partner.settleAmount} *
              <input
                required
                inputMode="decimal"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
              />
            </label>
            <label>
              {t.partner.settleCashWallet} *
              <select
                required
                value={settleWalletId}
                onChange={(e) => setSettleWalletId(e.target.value)}
              >
                {cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.common.notes}
              <input
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
              />
            </label>
            {settleError ? <p className="error">{settleError}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={settleBusy}
                onClick={() => setSettleRow(null)}
              >
                {t.common.cancel}
              </button>
              <button type="submit" disabled={settleBusy || !settleWalletId}>
                {settleBusy
                  ? t.common.saving
                  : settleKind === "PAY_PARTNER"
                    ? t.partner.payHim
                    : t.partner.collectFromHim}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
