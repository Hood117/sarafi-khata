import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  getVaultDashboard,
  listVaultMovements,
  softDeleteMovement,
  type VaultListItem,
  type VaultMovementRow,
} from "@desktop/api";
import {
  VaultCashFormModal,
  type VaultCashDirection,
} from "@desktop/components/vault-cash-form-modal";
import { VaultUnlockGate } from "@desktop/components/vault-unlock-gate";
import { useAuth } from "@desktop/auth";
import { IconCash } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { Pagination } from "@desktop/ui/pagination";
import { SuccessModal } from "@desktop/ui/success-modal";

/** Desk has one physical cash vault: Main Vault (ADR-044 / ADR-045). */
export function VaultsPage() {
  return (
    <VaultUnlockGate>
      <VaultsPageInner />
    </VaultUnlockGate>
  );
}

function VaultsPageInner() {
  const t = useT();
  const { session } = useAuth();
  const [main, setMain] = useState<VaultListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [history, setHistory] = useState<VaultMovementRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    row: VaultMovementRow;
  } | null>(null);

  const [cashOpen, setCashOpen] = useState(false);
  const [cashDirection, setCashDirection] = useState<VaultCashDirection>("CASH_IN");
  const [editCashId, setEditCashId] = useState<string | null>(null);
  const deleteRef = useRef(false);

  const loadDash = useCallback(async () => {
    setBusy(true);
    try {
      const d = await getVaultDashboard();
      const vault =
        d.vaults.find(
          (v) => v.name === "Main Vault" && v.vaultType.toUpperCase() === "VAULT",
        ) ??
        d.vaults.find((v) => v.name === "Main Vault") ??
        d.vaults.find((v) => v.isActive) ??
        null;
      setMain(vault);
      setError(null);
      return vault;
    } catch (err) {
      setError(errorMessage(err, t.errors.loadVaults));
      return null;
    } finally {
      setBusy(false);
    }
  }, [t.errors.loadVaults]);

  const loadHistory = useCallback(
    async (vaultId: string, page = historyPage) => {
      try {
        const mov = await listVaultMovements({
          vaultId,
          page,
          pageSize: historyPageSize,
        });
        setHistory(mov.items);
        setHistoryTotal(mov.total);
      } catch (err) {
        setError(errorMessage(err, t.errors.loadVaults));
      }
    },
    [historyPage, t.errors.loadVaults],
  );

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    if (!main?.id) return;
    void loadHistory(main.id);
  }, [main?.id, historyPage, loadHistory]);

  async function refreshAll() {
    const vault = await loadDash();
    if (vault) await loadHistory(vault.id, historyPage);
  }

  function openCash(mode: VaultCashDirection) {
    setEditCashId(null);
    setCashDirection(mode);
    setCashOpen(true);
  }

  function openEdit(row: VaultMovementRow) {
    const ref = row.reference.toUpperCase();
    setCashDirection(ref.startsWith("CASH-OUT") ? "CASH_OUT" : "CASH_IN");
    setEditCashId(row.transactionId);
    setCashOpen(true);
  }

  async function handleDelete(row: VaultMovementRow) {
    if (!session?.userId) return;
    if (
      !window.confirm(
        t.desk.deleteTxConfirm.replace("{reference}", txDisplayRef(row)),
      )
    ) {
      return;
    }
    if (!tryBeginSubmit(deleteRef)) return;
    setBusy(true);
    setError(null);
    try {
      await softDeleteMovement({ id: row.transactionId, createdById: session.userId });
      setSuccessMessage(t.common.success);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      endSubmit(deleteRef);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <PageLoadError message={error} onRetry={() => void refreshAll()} /> : null}
      {busy && !main ? <p className="muted">{t.common.loading}</p> : null}

      {main ? (
        <article className="card stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="row" style={{ gap: "0.75rem", alignItems: "center" }}>
              <IconCash />
              <div>
                <h2 style={{ margin: 0 }}>{main.name}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {main.currencyCount} {t.common.currencies}
                </p>
              </div>
            </div>
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" className="btn primary" onClick={() => openCash("CASH_IN")}>
                {t.desk.cashIn}
              </button>
              <button type="button" className="btn" onClick={() => openCash("CASH_OUT")}>
                {t.desk.cashOut}
              </button>
              <Link className="btn" to={`/vaults/${main.id}`}>
                {t.desk.viewVault}
              </Link>
            </div>
          </div>
        </article>
      ) : null}

      {!busy && !main && !error ? (
        <p className="muted">{t.exchange.mainVaultMissing}</p>
      ) : null}

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>
          {t.desk.cashHistory}
        </h2>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.noCashHistory}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.common.reference}</th>
                  <th>{t.common.type}</th>
                  <th>{t.common.currency}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.description}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const isOut = row.direction.toUpperCase() === "CREDIT";
                  const ref = row.reference.toUpperCase();
                  const kindLabel = ref.startsWith("CASH-IN")
                    ? t.desk.cashIn
                    : ref.startsWith("CASH-OUT")
                      ? t.desk.cashOut
                      : row.transactionType;
                  return (
                    <tr
                      key={`${row.transactionId}-${row.direction}-${row.currencyCode}-${row.amount}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRowMenu({ x: e.clientX, y: e.clientY, row });
                      }}
                    >
                      <td>{row.valueDate}</td>
                      <td className="ltr-text">{txDisplayRef(row)}</td>
                      <td>{kindLabel}</td>
                      <td>{row.currencyCode}</td>
                      <td className={isOut ? "money-out" : "money-in"}>
                        {isOut ? `−${row.amount}` : `+${row.amount}`}
                      </td>
                      <td>{row.description ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={historyPage}
          pageSize={historyPageSize}
          total={historyTotal}
          busy={busy}
          onPageChange={setHistoryPage}
        />
      </section>

      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            {
              id: "edit",
              label: t.common.editAction,
              disabled: busy,
              onSelect: () => openEdit(rowMenu.row),
            },
            {
              id: "delete",
              label: t.common.delete,
              danger: true,
              disabled: busy,
              onSelect: () => void handleDelete(rowMenu.row),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      <VaultCashFormModal
        open={cashOpen}
        direction={cashDirection}
        editTransactionId={editCashId}
        onClose={() => {
          setCashOpen(false);
          setEditCashId(null);
        }}
        onSaved={() => {
          setSuccessMessage(t.common.success);
          void refreshAll();
        }}
      />

      {successMessage ? (
        <SuccessModal
          title={t.common.success}
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
          primaryLabel={t.common.close}
        />
      ) : null}
    </div>
  );
}
