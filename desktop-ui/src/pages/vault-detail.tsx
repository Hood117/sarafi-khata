import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  getVaultDashboard,
  getVaultDetail,
  listCurrencyDenominations,
  listVaultAudit,
  listVaultMovements,
  reconcileVault,
  transferBetweenVaults,
  type CurrencyDenominationRow,
  type VaultAuditRow,
  type VaultCurrencyBalance,
  type VaultDetail,
  type VaultListItem,
  type VaultMovementRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import {
  IconCash,
  IconDashboard,
  IconHistory,
  IconTransfers,
} from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { Pagination } from "@desktop/ui/pagination";

type Tab =
  | "overview"
  | "balances"
  | "transactions"
  | "transfers"
  | "reconcile"
  | "denominations"
  | "audit";

const DIFF_REASON_VALUES = [
  "Cash counting error",
  "Missing transaction",
  "Overpayment",
  "Underpayment",
  "Other",
] as const;

function useDiffReasons(t: ReturnType<typeof useT>) {
  return useMemo(
    () =>
      DIFF_REASON_VALUES.map((value) => ({
        value,
        label:
          value === "Cash counting error"
            ? t.desk.cashCountingError
            : value === "Missing transaction"
              ? t.desk.missingTransaction
              : value === "Overpayment"
                ? t.desk.overpayment
                : value === "Underpayment"
                  ? t.desk.underpayment
                  : t.desk.other,
      })),
    [t],
  );
}

export function VaultDetailPage() {
  const { id = "" } = useParams();
  const t = useT();
  const diffReasons = useDiffReasons(t);
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [otherVaults, setOtherVaults] = useState<VaultListItem[]>([]);
  const [movements, setMovements] = useState<VaultMovementRow[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const movementsPageSize = 25;
  const [audit, setAudit] = useState<VaultAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 25;
  const [denoms, setDenoms] = useState<CurrencyDenominationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState("");

  const [toVaultId, setToVaultId] = useState("");
  const [xferCcy, setXferCcy] = useState("USD");
  const [xferAmount, setXferAmount] = useState("");
  const [xferReason, setXferReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [physical, setPhysical] = useState<Record<string, string>>({});
  const [lineReasons, setLineReasons] = useState<Record<string, string>>({});
  const [diffReason, setDiffReason] = useState("");
  const [reconNotes, setReconNotes] = useState("");
  const [denomQty, setDenomQty] = useState<Record<string, number>>({});
  const [countCcy, setCountCcy] = useState("USD");
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const [d, m, a, den, dash] = await Promise.all([
        getVaultDetail(id),
        listVaultMovements({
          vaultId: id,
          page: movementsPage,
          pageSize: movementsPageSize,
          search: search.trim() || undefined,
        }),
        listVaultAudit({ vaultId: id, page: auditPage, pageSize: auditPageSize }),
        listCurrencyDenominations(),
        getVaultDashboard(),
      ]);
      setDetail(d);
      setMovements(m.items);
      setMovementsTotal(m.total);
      setAudit(a.items);
      setAuditTotal(a.total);
      setDenoms(den);
      const others = dash.vaults.filter((x) => x.id !== id && x.isActive);
      setOtherVaults(others);
      if (!toVaultId && others[0]) setToVaultId(others[0].id);
      const phys: Record<string, string> = {};
      for (const b of d.balances) {
        phys[b.currencyCode] = b.currentBalance;
      }
      setPhysical(phys);
      if (d.balances[0]) {
        setXferCcy(d.balances[0].currencyCode);
        setCountCcy(d.balances[0].currencyCode);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [id, movementsPage, auditPage, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMovementsPage(1);
    setAuditPage(1);
  }, [id]);

  useEffect(() => {
    setMovementsPage(1);
  }, [search]);

  const filteredMovements = movements;

  const transfersOnly = useMemo(
    () =>
      filteredMovements.filter(
        (m) =>
          m.transactionType === "TRANSFER" ||
          m.reference.startsWith("VT-") ||
          m.reference.startsWith("CASH-XFER-"),
      ),
    [filteredMovements],
  );

  const countDenoms = useMemo(
    () => denoms.filter((d) => d.currencyCode === countCcy),
    [countCcy, denoms],
  );

  const denomTotal = useMemo(() => {
    let sum = 0;
    for (const d of countDenoms) {
      const q = denomQty[d.id] ?? 0;
      sum += (parseFloat(d.value) || 0) * q;
    }
    return sum;
  }, [countDenoms, denomQty]);

  const expectedForCount =
    detail?.balances.find((b) => b.currencyCode === countCcy)?.currentBalance ??
    "0";
  const countDiff = denomTotal - (parseFloat(expectedForCount) || 0);

  async function onTransfer(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId || !id || !toVaultId) return;
    setSaving(true);
    try {
      await transferBetweenVaults({
        fromVaultId: id,
        toVaultId,
        currencyCode: xferCcy,
        amount: xferAmount,
        reason: xferReason || undefined,
        createdById: session.userId,
      });
      setXferAmount("");
      setXferReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onReconcile(confirm: boolean) {
    if (!session?.userId || !detail) return;
    setSaving(true);
    setSuccess(null);
    try {
      const lines = detail.balances.map((b) => {
        let physicalAmount = physical[b.currencyCode] ?? b.currentBalance;
        let denominations:
          | Array<{
              denominationId?: string;
              label: string;
              value: string;
              quantity: number;
            }>
          | undefined;
        if (b.currencyCode === countCcy && Object.keys(denomQty).length > 0) {
          denominations = countDenoms
            .map((d) => ({
              denominationId: d.id,
              label: d.label,
              value: d.value,
              quantity: denomQty[d.id] ?? 0,
            }))
            .filter((x) => x.quantity > 0);
          if (denominations.length > 0) {
            physicalAmount = String(denomTotal);
          }
        }
        return {
          currencyCode: b.currencyCode,
          physicalAmount,
          reason: lineReasons[b.currencyCode] || undefined,
          denominations,
        };
      });
      const result = await reconcileVault({
        vaultId: detail.vault.id,
        confirm,
        differenceReason: diffReason || undefined,
        notes: reconNotes || undefined,
        createdById: session.userId,
        lines,
      });
      setError(
        null,
      );
      setSuccess(
        (result.hasDifference ? t.desk.savedDifference : t.desk.savedCountsMatch).replace(
          "{status}",
          statusLabel(t, result.status),
        ),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function exportCsv(rows: VaultMovementRow[]) {
    const header = [
      t.common.date,
      t.common.reference,
      t.common.type,
      t.common.from,
      t.desk.party,
      t.common.currency,
      t.common.amount,
      t.desk.direction,
      t.desk.createdBy,
      t.common.status,
    ];
    const lines = rows.map((r) =>
      [
        r.valueDate,
        r.reference,
        r.transactionType,
        r.walletName,
        r.counterpartyWallet ?? "",
        r.currencyCode,
        r.amount,
        r.direction,
        r.userName ?? "",
        r.status,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vault-${id}-movements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const v = detail?.vault;

  return (
    <div className="stack">
      <div>
        <Link className="nav-link" to="/vaults" style={{ padding: 0 }}>
          ← {t.nav.vaults}
        </Link>
        <h1 style={{ margin: "0.35rem 0 0.25rem" }}>{v?.name ?? t.desk.vault}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {v?.code ? `${v.code} · ` : ""}
          {v?.vaultType === "TILL" ? t.desk.cashierVault : t.desk.vault}
          {v?.location ? ` · ${v.location}` : ""}
          {v ? ` · ${v.isActive ? t.common.active : t.common.inactive}` : ""}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="muted">{success}</p> : null}
      {busy && !detail ? <p className="muted">{t.common.loading}</p> : null}

      <div className="nav-row">
        {(
          [
            ["overview", t.dashboard.overview, <IconDashboard key="o" />],
            ["balances", t.customers.balances, <IconCash key="b" />],
            ["transactions", t.nav.transactions, <IconHistory key="t" />],
            ["transfers", t.nav.transfers, <IconTransfers key="x" />],
            ["reconcile", t.desk.reconciliation, <IconCash key="r" />],
            ["denominations", t.desk.countCash, <IconCash key="d" />],
            ["audit", t.desk.auditLog, <IconHistory key="a" />],
          ] as Array<[Tab, string, ReactNode]>
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "nav-link active" : "nav-link"}
            onClick={() => setTab(key)}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
          {t.desk.refresh}
        </button>
      </div>

      {tab === "overview" && detail ? (
        <div className="stack">
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t.common.responsible}</div>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>
                {v?.responsibleUserName ?? "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.common.currencies}</div>
              <div className="stat-value">{v?.currencyCount ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.desk.combinedBalance}</div>
              <div className="stat-value">{v?.totalBalanceDisplay ?? "—"}</div>
            </div>
          </div>
          <BalanceTable balances={detail.balances} />
          <div className="card stack" style={{ maxWidth: "28rem" }}>
            <h3 style={{ margin: 0 }}>{t.desk.quickMoveCashOut}</h3>
            <form className="stack" onSubmit={(e) => void onTransfer(e)}>
              <label>
                {t.desk.toVault}
                <select
                  value={toVaultId}
                  onChange={(e) => setToVaultId(e.target.value)}
                  required
                >
                  {otherVaults.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.common.currency}
                <input
                  value={xferCcy}
                  onChange={(e) => setXferCcy(e.target.value.toUpperCase())}
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
              <button type="submit" className="btn primary" disabled={saving || !toVaultId}>
                {t.desk.moveCash}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {tab === "balances" && detail ? <BalanceTable balances={detail.balances} /> : null}

      {(tab === "transactions" || tab === "transfers") && (
        <div className="stack">
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                exportCsv(tab === "transfers" ? transfersOnly : filteredMovements)
              }
            >
              {t.desk.exportExcelCsv}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              {t.common.print}
            </button>
          </div>
          <MovementTable
            rows={tab === "transfers" ? transfersOnly : filteredMovements}
          />
          {tab === "transactions" ? (
            <Pagination
              page={movementsPage}
              pageSize={movementsPageSize}
              total={movementsTotal}
              busy={busy}
              onPageChange={setMovementsPage}
            />
          ) : null}
        </div>
      )}

      {tab === "reconcile" && detail ? (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>{t.desk.countAndReconcile}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.reconciliationHint}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t.common.currency}</th>
                <th>{t.common.expected}</th>
                <th>{t.common.physical}</th>
                <th>{t.common.difference}</th>
                <th>{t.common.description}</th>
              </tr>
            </thead>
            <tbody>
              {detail.balances.map((b) => {
                const phys = physical[b.currencyCode] ?? b.currentBalance;
                const diff =
                  (parseFloat(phys) || 0) - (parseFloat(b.currentBalance) || 0);
                return (
                  <tr key={b.currencyId}>
                    <td>{b.currencyCode}</td>
                    <td>{b.currentBalance}</td>
                    <td>
                      <input
                        value={phys}
                        onChange={(e) =>
                          setPhysical((p) => ({
                            ...p,
                            [b.currencyCode]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td style={{ color: Math.abs(diff) > 0.0001 ? "#b45309" : undefined }}>
                      {diff.toFixed(2)}
                    </td>
                    <td>
                      <select
                        value={lineReasons[b.currencyCode] ?? ""}
                        onChange={(e) =>
                          setLineReasons((p) => ({
                            ...p,
                            [b.currencyCode]: e.target.value,
                          }))
                        }
                      >
                        <option value="">—</option>
                        {diffReasons.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label>
            {t.desk.overallDifferenceReason}
            <select value={diffReason} onChange={(e) => setDiffReason(e.target.value)}>
              <option value="">—</option>
              {diffReasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.common.notes}
            <textarea
              value={reconNotes}
              onChange={(e) => setReconNotes(e.target.value)}
              rows={2}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void onReconcile(false)}
            >
              {t.desk.saveDraft}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void onReconcile(true)}
            >
              {t.desk.confirmCount}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "denominations" && detail ? (
        <div className="card stack" style={{ maxWidth: "36rem" }}>
          <h2 style={{ margin: 0 }}>{t.desk.countNotes}</h2>
          <label>
            {t.common.currency}
            <select value={countCcy} onChange={(e) => setCountCcy(e.target.value)}>
              {detail.balances.map((b) => (
                <option key={b.currencyId} value={b.currencyCode}>
                  {b.currencyCode}
                </option>
              ))}
              {detail.balances.length === 0 ? (
                <>
                  <option value="USD">USD</option>
                  <option value="AFN">AFN</option>
                </>
              ) : null}
            </select>
          </label>
          {countDenoms.length === 0 ? (
            <p className="muted">
              {t.desk.noDenominations.replace("{currency}", countCcy)}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t.desk.note}</th>
                  <th>{t.desk.quantity}</th>
                  <th>{t.desk.subtotal}</th>
                </tr>
              </thead>
              <tbody>
                {countDenoms.map((d) => {
                  const q = denomQty[d.id] ?? 0;
                  const sub = (parseFloat(d.value) || 0) * q;
                  return (
                    <tr key={d.id}>
                      <td>
                        {d.label} ({d.value})
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={q}
                          onChange={(e) =>
                            setDenomQty((p) => ({
                              ...p,
                              [d.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          style={{ width: "5rem" }}
                        />
                      </td>
                      <td>{sub.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t.desk.physicalTotal}</div>
              <div className="stat-value">{denomTotal.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.common.expected}</div>
              <div className="stat-value">{expectedForCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t.common.difference}</div>
              <div
                className="stat-value"
                style={{ color: Math.abs(countDiff) > 0.0001 ? "#b45309" : undefined }}
              >
                {countDiff.toFixed(2)}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setPhysical((p) => ({ ...p, [countCcy]: String(denomTotal) }));
              setTab("reconcile");
            }}
          >
            {t.desk.useCountInReconciliation}
          </button>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t.common.when}</th>
                <th>{t.common.actions}</th>
                <th>{t.common.user}</th>
                <th>{t.common.details}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{a.createdAt}</td>
                  <td>{a.action}</td>
                  <td>{a.userName ?? "—"}</td>
                  <td style={{ fontSize: "0.8rem", maxWidth: "20rem" }}>
                    {a.afterValues ?? a.beforeValues ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {audit.length === 0 ? <p className="muted">{t.desk.noVaultAuditEntries}</p> : null}
          <Pagination
            page={auditPage}
            pageSize={auditPageSize}
            total={auditTotal}
            busy={busy}
            onPageChange={setAuditPage}
          />
        </div>
      ) : null}
    </div>
  );
}

function BalanceTable({ balances }: { balances: VaultCurrencyBalance[] }) {
  const t = useT();
  if (balances.length === 0) {
    return <p className="muted">{t.desk.noCurrencyBalancesVault}</p>;
  }
  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>{t.common.currency}</th>
            <th>{t.common.current}</th>
            <th>{t.common.opening}</th>
            <th>{t.desk.inToday}</th>
            <th>{t.desk.outToday}</th>
            <th>{t.desk.expectedClose}</th>
            <th>{t.desk.lastMovement}</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.currencyId}>
              <td>
                <strong>{b.currencyCode}</strong>
                {b.currencySymbol ? ` ${b.currencySymbol}` : ""}
              </td>
              <td style={{ fontWeight: 650 }}>{b.currentBalance}</td>
              <td>{b.openingBalance}</td>
              <td>{b.cashInToday}</td>
              <td>{b.cashOutToday}</td>
              <td>{b.expectedClosing}</td>
              <td className="muted">{b.lastMovementAt ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementTable({ rows }: { rows: VaultMovementRow[] }) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="muted">{t.desk.noMovementsFound}</p>;
  }
  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>{t.common.date}</th>
            <th>{t.common.reference}</th>
            <th>{t.common.type}</th>
            <th>{t.common.wallet}</th>
            <th>{t.desk.walletOtherSide}</th>
            <th>{t.common.currency}</th>
            <th>{t.common.amount}</th>
            <th>{t.desk.createdBy}</th>
            <th>{t.common.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.transactionId}-${r.direction}-${r.currencyCode}`}>
              <td>{r.valueDate}</td>
              <td>{r.reference}</td>
              <td>{r.transactionType}</td>
              <td>{r.walletName}</td>
              <td>{r.counterpartyWallet ?? "—"}</td>
              <td>{r.currencyCode}</td>
              <td>
                {r.direction === "DEBIT" ? "+" : "−"}
                {r.amount}
              </td>
              <td>{r.userName ?? "—"}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
