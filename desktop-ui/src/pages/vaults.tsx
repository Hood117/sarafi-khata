import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  archiveVault,
  deleteVaultMovement,
  getVaultDashboard,
  listUsersLite,
  listVaultMovements,
  transferBetweenVaults,
  updateVaultMovement,
  upsertVault,
  type UserLite,
  type VaultDashboard,
  type VaultListItem,
  type VaultMovementRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { IconCash, IconTransfers } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { Stat } from "@desktop/ui/stat";

function isCashierRole(role: string | undefined | null) {
  const r = (role ?? "").toUpperCase();
  return r.includes("CASHIER") || r.includes("TELLER") || r.includes("TILL");
}

export function VaultsPage() {
  const t = useT();
  const { session } = useAuth();
  const [dash, setDash] = useState<VaultDashboard | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [history, setHistory] = useState<VaultMovementRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [vaultType, setVaultType] = useState<"VAULT" | "TILL">("VAULT");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const [showXfer, setShowXfer] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [xferCcy, setXferCcy] = useState("USD");
  const [xferAmount, setXferAmount] = useState("");
  const [xferReason, setXferReason] = useState("");

  const [editMove, setEditMove] = useState<VaultMovementRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState("");

  const loadDash = useCallback(async () => {
    setBusy(true);
    try {
      const [d, u] = await Promise.all([getVaultDashboard(), listUsersLite(true)]);
      setDash(d);
      setUsers(u);
      setFromId((prev) => prev || d.vaults.find((v) => v.isActive)?.id || "");
      setToId(
        (prev) =>
          prev ||
          d.vaults.filter((v) => v.isActive)[1]?.id ||
          d.vaults.filter((v) => v.isActive)[0]?.id ||
          "",
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const mov = await listVaultMovements({
        page: historyPage,
        pageSize: historyPageSize,
      });
      // One row per transfer (money-out / CREDIT side) for cleaner history.
      const seen = new Set<string>();
      const transfers: VaultMovementRow[] = [];
      for (const row of mov.items) {
        if (row.transactionType !== "TRANSFER" && !row.reference.startsWith("VT-")) {
          continue;
        }
        if (seen.has(row.transactionId)) continue;
        if (row.direction !== "CREDIT") continue;
        seen.add(row.transactionId);
        transfers.push(row);
      }
      setHistory(transfers);
      setHistoryTotal(mov.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [historyPage]);

  const load = useCallback(async () => {
    await loadDash();
    await loadHistory();
  }, [loadDash, loadHistory]);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const visibleVaults = useMemo(() => {
    if (!dash) return [];
    let rows = dash.vaults;
    if (isCashierRole(session?.role) && session?.userId) {
      rows = rows.filter(
        (v) => !v.responsibleUserId || v.responsibleUserId === session.userId,
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.code ?? "").toLowerCase().includes(q) ||
          (v.location ?? "").toLowerCase().includes(q) ||
          (v.responsibleUserName ?? "").toLowerCase().includes(q),
      );
    }
    if (statusFilter === "ACTIVE") rows = rows.filter((v) => v.isActive);
    if (statusFilter === "INACTIVE") rows = rows.filter((v) => !v.isActive);
    return rows;
  }, [dash, search, session?.role, session?.userId, statusFilter]);

  function openCreate() {
    setEditId(null);
    setName("");
    setCode("");
    setLocation("");
    setDescription("");
    setNotes("");
    setVaultType("VAULT");
    setResponsibleUserId("");
    setShowForm(true);
  }

  function openEdit(v: VaultListItem) {
    setEditId(v.id);
    setName(v.name);
    setCode(v.code ?? "");
    setLocation(v.location ?? "");
    setDescription(v.description ?? "");
    setNotes(v.notes ?? "");
    setVaultType(v.vaultType === "TILL" ? "TILL" : "VAULT");
    setResponsibleUserId(v.responsibleUserId ?? "");
    setShowForm(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId) return;
    setSaving(true);
    try {
      await upsertVault({
        id: editId ?? undefined,
        name,
        code: code || undefined,
        location: location || undefined,
        description: description || undefined,
        notes: notes || undefined,
        vaultType,
        responsibleUserId: responsibleUserId || null,
        isActive: true,
        createdById: session.userId,
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(v: VaultListItem) {
    if (!session?.userId) return;
    if (!window.confirm(`${v.name} — ${t.desk.deactivateVaultFirst}`)) return;
    try {
      await archiveVault(v.id, session.userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onTransfer(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId) return;
    setSaving(true);
    try {
      await transferBetweenVaults({
        fromVaultId: fromId,
        toVaultId: toId,
        currencyCode: xferCcy,
        amount: xferAmount,
        reason: xferReason || undefined,
        createdById: session.userId,
      });
      setShowXfer(false);
      setXferAmount("");
      setXferReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function openEditMove(row: VaultMovementRow) {
    setEditMove(row);
    setEditAmount(row.amount);
    setEditReason(row.description ?? "");
  }

  async function onSaveMove(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId || !editMove) return;
    setSaving(true);
    try {
      await updateVaultMovement({
        transactionId: editMove.transactionId,
        amount: editAmount,
        reason: editReason || undefined,
        createdById: session.userId,
      });
      setEditMove(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteMove(row: VaultMovementRow) {
    if (!session?.userId) return;
    if (
      !window.confirm(
        `Delete move ${row.reference}? Cash will return to the original vaults.`,
      )
    ) {
      return;
    }
    try {
      await deleteVaultMovement({
        transactionId: row.transactionId,
        createdById: session.userId,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.vaults}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.vaultsIntro}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setShowXfer(true)}>
            <IconTransfers /> {t.desk.moveCash}
          </button>
          <button type="button" className="btn primary" onClick={openCreate}>
            {t.desk.newVault}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="stat-grid">
        <Stat label={t.desk.totalCashHeld} value={dash?.totalCashHeld ?? "—"} />
        <Stat label={t.desk.activeVaults} value={String(dash?.activeVaults ?? "—")} />
        <Stat label={t.desk.transfersToday} value={String(dash?.transfersToday ?? "—")} />
        <Stat label={t.desk.differencesToday} value={String(dash?.vaultDifferences ?? "—")} />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder={t.common.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: "14rem" }}
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
          }
        >
          <option value="ALL">{t.hawala.allStatuses}</option>
          <option value="ACTIVE">{t.common.active}</option>
          <option value="INACTIVE">{t.common.inactive}</option>
        </select>
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
          {t.desk.refresh}
        </button>
      </div>

      {busy && !dash ? <p className="muted">{t.common.loading}</p> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {visibleVaults.map((v) => (
          <article key={v.id} className="card stack" style={{ gap: "0.65rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 650, fontSize: "1.05rem" }}>{v.name}</div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {v.code ? `${v.code} · ` : ""}
                  {v.vaultType === "TILL" ? t.desk.cashierVault : t.desk.vault}
                  {v.location ? ` · ${v.location}` : ""}
                </div>
              </div>
              <span className={v.isActive ? "badge badge-ok" : "badge"}>
                {v.isActive ? t.common.active : t.common.inactive}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <IconCash />
              <span style={{ fontSize: "1.35rem", fontWeight: 650 }}>
                {v.totalBalanceDisplay}
              </span>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {v.currencyCount} {t.common.currencies}
              </span>
            </div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              {t.common.responsible}: {v.responsibleUserName ?? "—"}
              <br />
              {t.desk.lastMovement}: {v.lastActivityAt ?? "—"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <Link className="btn primary" to={`/vaults/${v.id}`}>
                {t.desk.viewVault}
              </Link>
              <button type="button" className="btn" onClick={() => openEdit(v)}>
                {t.common.edit}
              </button>
              {v.isActive ? (
                <button type="button" className="btn" onClick={() => void onDeactivate(v)}>
                  {t.common.deactivate}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {visibleVaults.length === 0 && !busy ? (
        <p className="muted">{t.desk.vaultsNoMatch}</p>
      ) : null}

      <section className="card stack">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            {t.desk.moveCashHistory}
          </h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {t.desk.moveCashHistoryHint}
          </span>
        </div>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.noVaultTransfers}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.common.reference}</th>
                <th>{t.common.from}</th>
                <th>{t.common.to}</th>
                <th>{t.common.currency}</th>
                <th>{t.common.amount}</th>
                <th>{t.common.description}</th>
                <th>{t.desk.createdBy}</th>
                <th>{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.transactionId}>
                  <td>{row.valueDate}</td>
                  <td>{row.reference}</td>
                  <td>{row.walletName}</td>
                  <td>{row.counterpartyWallet ?? "—"}</td>
                  <td>{row.currencyCode}</td>
                  <td>{row.amount}</td>
                  <td>{row.description ?? "—"}</td>
                  <td>{row.userName ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => openEditMove(row)}
                      >
                        {t.common.edit}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void onDeleteMove(row)}
                      >
                        {t.common.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={historyPage}
          pageSize={historyPageSize}
          total={historyTotal}
          busy={busy}
          onPageChange={setHistoryPage}
        />
      </section>

      {showForm ? (
        <Modal
          title={editId ? t.desk.editVault : t.desk.newVault}
          onClose={() => !saving && setShowForm(false)}
        >
          <form className="stack" onSubmit={(e) => void onSave(e)}>
            <label>
              {t.common.name}
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              {t.desk.code}
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label>
              {t.common.location}
              <input value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label>
              {t.common.type}
              <select
                value={vaultType}
                onChange={(e) => setVaultType(e.target.value as "VAULT" | "TILL")}
              >
                <option value="VAULT">{t.desk.vault}</option>
                <option value="TILL">{t.desk.cashierVault} ({t.desk.till})</option>
              </select>
            </label>
            <label>
              {t.desk.responsibleUser}
              <select
                value={responsibleUserId}
                onChange={(e) => setResponsibleUserId(e.target.value)}
              >
                <option value="">{t.desk.noneOption}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.username})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.common.description}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </label>
            <label>
              {t.common.notes}
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </label>
            <div className="modal-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? t.common.saving : t.common.save}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showXfer ? (
        <Modal title={t.desk.moveCashBetweenVaults} onClose={() => !saving && setShowXfer(false)}>
          <p className="muted" style={{ margin: 0 }}>
            Total business cash does not change — only the physical location.
          </p>
          <form className="stack" onSubmit={(e) => void onTransfer(e)}>
            <label>
              {t.common.from}
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                {(dash?.vaults ?? [])
                  .filter((v) => v.isActive)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t.common.to}
              <select value={toId} onChange={(e) => setToId(e.target.value)} required>
                {(dash?.vaults ?? [])
                  .filter((v) => v.isActive)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t.common.currency}
              <input
                value={xferCcy}
                onChange={(e) => setXferCcy(e.target.value.toUpperCase())}
                required
              />
            </label>
            <label>
              {t.common.amount}
              <input
                value={xferAmount}
                onChange={(e) => setXferAmount(e.target.value)}
                required
              />
            </label>
            <label>
              {t.common.description}
              <input value={xferReason} onChange={(e) => setXferReason(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? t.desk.moving : t.desk.moveCash}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowXfer(false)}
                disabled={saving}
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editMove ? (
        <Modal
          title={t.desk.editMove.replace("{reference}", editMove.reference)}
          onClose={() => !saving && setEditMove(null)}
        >
          <form className="stack" onSubmit={(e) => void onSaveMove(e)}>
            <p className="muted" style={{ margin: 0 }}>
              {editMove.walletName} → {editMove.counterpartyWallet ?? "—"} ·{" "}
              {editMove.currencyCode}
            </p>
            <label>
              {t.common.amount}
              <input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
            </label>
            <label>
              {t.common.description}
              <input value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? t.common.saving : t.common.saveChanges}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setEditMove(null)}
                disabled={saving}
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
