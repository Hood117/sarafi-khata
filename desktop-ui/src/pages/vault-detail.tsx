import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  getVaultDetail,
  type VaultCurrencyBalance,
  type VaultDetail,
} from "@desktop/api";
import { VaultUnlockGate } from "@desktop/components/vault-unlock-gate";
import { Banknote, LayoutDashboard } from "lucide-react";
import { useT } from "@desktop/i18n";
import { moneyToneClass } from "@desktop/lib/currency-labels";

type Tab = "overview" | "balances";

/** Main Vault detail — balances only. Cash In/Out/History live on `/vaults`. */
export function VaultDetailPage() {
  return (
    <VaultUnlockGate>
      <VaultDetailPageInner />
    </VaultUnlockGate>
  );
}

function VaultDetailPageInner() {
  const { id = "" } = useParams();
  const t = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const d = await getVaultDetail(id);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const v = detail?.vault;

  return (
    <div className="stack page-column">
      <div>
        <Link className="nav-link" to="/vaults" style={{ padding: 0 }}>
          ← {t.nav.vaults}
        </Link>
        <h1 style={{ margin: "0.35rem 0 0.25rem" }}>{v?.name ?? t.desk.vault}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {v?.code ? `#${v.code} · ` : ""}
          {t.desk.vault}
          {v ? ` · ${v.isActive ? t.common.active : t.common.inactive}` : ""}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !detail ? <p className="muted">{t.common.loading}</p> : null}

      <div className="nav-row">
        <button
          type="button"
          className={tab === "overview" ? "nav-link active" : "nav-link"}
          onClick={() => setTab("overview")}
        >
          <span className="nav-link-icon">
            <LayoutDashboard className="nav-icon" size={18} />
          </span>
          <span className="nav-link-label">{t.dashboard.overview}</span>
        </button>
        <button
          type="button"
          className={tab === "balances" ? "nav-link active" : "nav-link"}
          onClick={() => setTab("balances")}
        >
          <span className="nav-link-icon">
            <Banknote className="nav-icon" size={18} />
          </span>
          <span className="nav-link-label">{t.customers.balances}</span>
        </button>
      </div>

      {tab === "overview" && detail ? (
        <div className="stack">
          <div className="stat-grid">
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
        </div>
      ) : null}

      {tab === "balances" && detail ? <BalanceTable balances={detail.balances} /> : null}
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
              <td className={moneyToneClass(b.currentBalance)} style={{ fontWeight: 650 }}>
                {b.currentBalance}
              </td>
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
