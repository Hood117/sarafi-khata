import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCashBalances, type CashBalanceRow } from "@desktop/api";
import { Banknote, Landmark } from "lucide-react";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { CurrencyCodeWithFlag, CurrencyFlag } from "@desktop/ui/currency-flag";
import {
  currencyDisplaySymbol,
  localizedCurrencyName,
  moneyToneClass,
} from "@desktop/lib/currency-labels";

function currencyAccent(code: string): string {
  const map: Record<string, string> = {
    USD: "#0f6b4c",
    AFN: "#b45309",
    EUR: "#1d4ed8",
    PKR: "#0f766e",
    AED: "#6d28d9",
    GBP: "#be185d",
    SAR: "#047857",
    QAR: "#7c2d12",
  };
  return map[code.toUpperCase()] ?? "#0f6b4c";
}

/** Compact cards for Dashboard — non-zero Main Vault balances only. */
export function CashBalanceCards({
  rows,
  emptyText,
  limit,
}: {
  rows: CashBalanceRow[];
  emptyText?: string;
  /** When set, show only the top N by absolute balance. */
  limit?: number;
}) {
  const t = useT();
  const visible = rows
    .filter((row) => {
      const n = Number.parseFloat(String(row.balanceDisplay).replace(/,/g, ""));
      return Number.isFinite(n) && n !== 0;
    })
    .sort((a, b) => {
      const absA = Math.abs(Number.parseInt(a.amountMinor, 10) || 0);
      const absB = Math.abs(Number.parseInt(b.amountMinor, 10) || 0);
      return absB - absA;
    });
  const shown =
    limit != null && limit > 0 ? visible.slice(0, limit) : visible;
  if (shown.length === 0) {
    return <p className="muted">{emptyText ?? t.cash.noBalances}</p>;
  }

  return (
    <div className="cash-card-grid">
      {shown.map((row) => {
        const accent = currencyAccent(row.currencyCode);
        return (
          <article
            key={row.currencyCode}
            className="cash-balance-card"
            style={{ ["--cash-accent" as string]: accent }}
          >
            <div className="cash-balance-card-top">
              <div className="cash-balance-code-wrap">
                <CurrencyCodeWithFlag code={row.currencyCode} />
                {currencyDisplaySymbol(row.currencyCode, row.currencySymbol) ? (
                  <span className="cash-balance-symbol">
                    {currencyDisplaySymbol(row.currencyCode, row.currencySymbol)}
                  </span>
                ) : null}
              </div>
              <span className="cash-balance-icon" aria-hidden>
                <Banknote className="nav-icon" size={18} />
              </span>
            </div>
            <div className={`cash-balance-amount ${moneyToneClass(row.balanceDisplay)}`}>
              {row.balanceDisplay}
            </div>
            <div className="cash-balance-meta muted">{t.cash.shopCash}</div>
          </article>
        );
      })}
    </div>
  );
}

export function CashPage() {
  const t = useT();
  const { locale } = useLocale();
  const [rows, setRows] = useState<CashBalanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await getCashBalances();
      setRows(data);
      setError(null);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.loadCash));
    } finally {
      setBusy(false);
    }
  }, [t.errors.loadCash]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack cash-page workspace-page is-cash">
      {error ? <PageLoadError message={error} onRetry={() => void load()} /> : null}
      {busy && !rows ? <p className="muted">{t.common.loading}</p> : null}

      {rows ? (
        rows.length === 0 ? (
          <p className="muted">{t.cash.noBalances}</p>
        ) : (
          <section className="panel records-panel">
            <div className="records-chrome">
              <div className="records-title">
                <div>
                  <h2>{t.nav.cash}</h2>
                  <span className="count-badge">{rows.length}</span>
                </div>
                <div className="records-title-actions">
                  <Link className="btn" to="/vaults">
                    <Landmark className="nav-icon" size={18} /> {t.desk.cashIn} / {t.desk.cashOut}
                  </Link>
                </div>
              </div>
            </div>
            <div className="table-scroll">
              <table className="report-ledger daybook-journal-table cash-overview-table">
                <thead>
                  <tr>
                    <th className="col-row">{t.cash.rowNo}</th>
                    <th>{t.cash.currencyName}</th>
                    <th>{t.cash.currencyCode}</th>
                    <th className="col-amount">{t.cash.amount}</th>
                    <th>{t.cash.flag}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const name = localizedCurrencyName(
                      row.currencyCode,
                      locale,
                      row.currencyName,
                    );
                    return (
                      <tr key={row.currencyCode}>
                        <td className="col-row">{idx + 1}</td>
                        <td>{name}</td>
                        <td>
                          <CurrencyCodeWithFlag code={row.currencyCode} />
                        </td>
                        <td className={`col-amount amount-emphasis ${moneyToneClass(row.balanceDisplay)}`}>
                          {row.balanceDisplay}
                        </td>
                        <td className="cash-flag-cell">
                          <CurrencyFlag
                            code={row.currencyCode}
                            className="cash-currency-flag"
                            size="md"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}
    </div>
  );
}
