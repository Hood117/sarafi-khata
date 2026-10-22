import { useCallback, useEffect, useState } from "react";

import { getDashboardSnapshot, openExternalUrl, type DashboardSnapshot } from "@desktop/api";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { useT } from "@desktop/i18n";
import {
  APP_COMPANY,
  APP_DEVELOPERS,
  formatWhatsAppDisplay,
} from "@desktop/lib/app-developers";
import { errorMessage } from "@desktop/lib/datetime";
import { openWhatsApp } from "@desktop/lib/whatsapp";
import { DashboardBoard } from "@desktop/pages/dashboard-board";
import { PageLoadError } from "@desktop/ui/page-load-error";

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
    <div className="dashboard-page page-column">
      <div className="stack dashboard-page-body">
        {error ? (
          <PageLoadError message={error} onRetry={reloadDashboard} />
        ) : null}
        {busy && !data ? <p className="muted">{t.common.loading}</p> : null}

        {data ? <DashboardBoard data={data} /> : null}
      </div>

      <footer className="dashboard-footer" aria-label={t.dashboard.companyCredits}>
        <div className="dashboard-footer-inner">
          <div className="dashboard-footer-credit">
            <span className="dashboard-footer-developed">
              {t.dashboard.developedBy}{" "}
              <span className="ltr-text" dir="ltr">
                {APP_COMPANY.name}
              </span>
            </span>
            <button
              type="button"
              className="dashboard-footer-link ltr-text"
              dir="ltr"
              onClick={() => void openExternalUrl(APP_COMPANY.url)}
              title={APP_COMPANY.url}
            >
              {APP_COMPANY.websiteLabel}
            </button>
            {APP_DEVELOPERS.map((dev) => (
              <span key={dev.email} className="dashboard-footer-dev">
                <span className="dashboard-footer-dev-name">{dev.name}</span>
                <button
                  type="button"
                  className="dashboard-footer-link ltr-text"
                  dir="ltr"
                  onClick={() => void openExternalUrl(`mailto:${dev.email}`)}
                  title={t.common.email}
                >
                  {dev.email}
                </button>
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
            ))}
          </div>
          <p className="dashboard-footer-copy">
            <span className="dashboard-footer-legal" dir="ltr">
              © {copyrightYear} ASMS.
            </span>
            <span className="dashboard-footer-rights">{t.dashboard.rightsReserved}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
