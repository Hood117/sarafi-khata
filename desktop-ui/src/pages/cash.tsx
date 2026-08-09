import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCashBalances, type CashBalanceRow } from "@desktop/api";
import { IconCash, IconVault } from "@desktop/icons";
import { useT } from "@desktop/i18n";

function currencyAccent(code: string): string {
  const map: Record<string, string> = {
    USD: "#0f6b4c",
    AFN: "#b45309",
    EUR: "#1d4ed8",
    PKR: "#0f766e",
    AED: "#6d28d9",
    GBP: "#be185d",
  };
  return map[code.toUpperCase()] ?? "#0f6b4c";
}

export function CashBalanceCards({
  rows,
  emptyText,
}: {
  rows: CashBalanceRow[];
  emptyText?: string;
}) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="muted">{emptyText ?? t.cash.noBalances}</p>;
  }

  return (
    <div className="cash-card-grid">
      {rows.map((row) => {
        const accent = currencyAccent(row.currencyCode);
        return (
          <article
            key={row.currencyCode}
            className="cash-balance-card"
            style={{ ["--cash-accent" as string]: accent }}
          >
            <div className="cash-balance-card-top">
              <div className="cash-balance-code-wrap">
                <span className="cash-balance-code">{row.currencyCode}</span>
                {row.currencySymbol ? (
                  <span className="cash-balance-symbol">{row.currencySymbol}</span>
                ) : null}
              </div>
              <span className="cash-balance-icon" aria-hidden>
                <IconCash />
              </span>
            </div>
            <div className="cash-balance-amount">{row.balanceDisplay}</div>
            <div className="cash-balance-meta muted">{t.cash.shopCash}</div>
          </article>
        );
      })}
    </div>
  );
}

export function CashPage() {
  const t = useT();
  const [rows, setRows] = useState<CashBalanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void getCashBalances()
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
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
  }, []);

  return (
    <div className="stack">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.cash}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.cash.overview}
          </p>
        </div>
        <Link className="btn" to="/vaults">
          <IconVault /> {t.nav.vaults}
        </Link>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy ? <p className="muted">{t.common.loading}</p> : null}
      {rows ? <CashBalanceCards rows={rows} /> : null}
    </div>
  );
}
