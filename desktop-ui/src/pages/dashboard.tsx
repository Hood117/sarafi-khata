import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getDashboardSnapshot, openExternalUrl, type DashboardSnapshot } from "@desktop/api";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { useT } from "@desktop/i18n";
import { APP_DEVELOPERS, formatWhatsAppDisplay } from "@desktop/lib/app-developers";
import { errorMessage } from "@desktop/lib/datetime";
import { openWhatsApp } from "@desktop/lib/whatsapp";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { Stat } from "@desktop/ui/stat";
import { CashBalanceCards } from "@desktop/pages/cash";

export function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const copyrightYear = 2026;

  const reloadDashboard = useCallback(() => {
    void getDashboardSnapshot()
      .then((snap) => {
        setData(snap);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void getDashboardSnapshot()
      .then((snap) => {
        if (!cancelled) {
          setData(snap);
          setError(null);
        }
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
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    const onSaved = () => reloadDashboard();
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [reloadDashboard]);

  return (
    <div className="dashboard-page">
      <div className="stack dashboard-page-body">
        {error ? (
          <PageLoadError message={error} onRetry={reloadDashboard} />
        ) : null}
        {busy && !data ? <p className="muted">{t.common.loading}</p> : null}

        {data ? (
          <>
            <div className="stat-grid">
              <Stat
                label={t.dashboard.deposits}
                value={data.month.deposits}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
              <Stat
                label={t.dashboard.withdrawals}
                value={data.month.withdrawals}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
              <Stat
                label={t.nav.transfers}
                value={data.month.transfers}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
              <Stat
                label={t.dashboard.exchanges}
                value={data.month.exchanges}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
              <Stat
                label={t.dashboard.newCustomers}
                value={data.customers.newThisMonth}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
              <Stat
                label={t.dashboard.activeCustomers}
                value={data.customers.active}
                hint={t.dashboard.currentlyActive}
                valueSize="1.75rem"
              />
              <Stat
                label={t.nav.hawala}
                value={data.month.hawala}
                hint={t.common.thisMonth}
                valueSize="1.75rem"
              />
            </div>

            <div className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 className="section-title">{t.dashboard.businessCash}</h2>
                <Link className="nav-link" to="/cash">
                  {t.dashboard.viewCash}
                </Link>
              </div>
              {data.cash.length === 0 ? (
                <p className="muted">{t.cash.noBalances}</p>
              ) : (
                <CashBalanceCards rows={data.cash} />
              )}
            </div>
          </>
        ) : null}
      </div>

      <footer className="dashboard-footer">
        <div className="dashboard-footer-inner">
          <div className="dashboard-footer-brand">
            <span className="dashboard-footer-mark" aria-hidden>
              ASMS
            </span>
            <p className="dashboard-footer-copy">
              <span className="dashboard-footer-legal" dir="ltr">
                © {copyrightYear} ASMS.
              </span>
              <span className="dashboard-footer-rights">{t.dashboard.rightsReserved}</span>
            </p>
          </div>

          <div className="dashboard-footer-credit">
            <p className="dashboard-footer-developed">{t.dashboard.developedBy}</p>
            <ul className="dashboard-footer-devs">
              {APP_DEVELOPERS.map((dev) => (
                <li key={dev.email} className="dashboard-footer-dev">
                  <span className="dashboard-footer-dev-name">{dev.name}</span>
                  <span className="dashboard-footer-dev-meta">
                    <button
                      type="button"
                      className="dashboard-footer-link ltr-text"
                      dir="ltr"
                      onClick={() => void openExternalUrl(`mailto:${dev.email}`)}
                      title={t.common.email}
                    >
                      {dev.email}
                    </button>
                    <span className="dashboard-footer-dot" aria-hidden>
                      ·
                    </span>
                    <button
                      type="button"
                      className="dashboard-footer-link ltr-text"
                      dir="ltr"
                      onClick={() => void openWhatsApp(dev.whatsapp, "")}
                      title={t.dashboard.whatsapp}
                    >
                      {formatWhatsAppDisplay(dev.whatsapp)}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
