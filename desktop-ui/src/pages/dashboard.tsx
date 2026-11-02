import { useCallback, useEffect, useState } from "react";

import {
  getDashboardSnapshot,
  getDaybookSnapshot,
  listHawalaDesk,
  type DashboardSnapshot,
} from "@desktop/api";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { DashboardBoard } from "@desktop/pages/dashboard-board";
import { PageLoadError } from "@desktop/ui/page-load-error";

export function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [pendingHawala, setPendingHawala] = useState(0);
  const [todayCashIn, setTodayCashIn] = useState("0.00");
  const [todayCashOut, setTodayCashOut] = useState("0.00");
  const [baseCurrency, setBaseCurrency] = useState("AFN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const reloadDashboard = useCallback(() => {
    void Promise.all([
      getDashboardSnapshot(),
      getDaybookSnapshot({}),
      listHawalaDesk({ page: 1, pageSize: 1 }),
    ])
      .then(([snap, daybook, hawala]) => {
        setData(snap);
        setPendingHawala(hawala.pending ?? 0);
        setTodayCashIn(daybook.dailySummary.cashIn || "0.00");
        setTodayCashOut(daybook.dailySummary.cashOut || "0.00");
        const firstCash = daybook.cashPosition[0]?.currencyCode;
        if (firstCash) setBaseCurrency(firstCash);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      getDashboardSnapshot(),
      getDaybookSnapshot({}),
      listHawalaDesk({ page: 1, pageSize: 1 }),
    ])
      .then(([snap, daybook, hawala]) => {
        if (cancelled) return;
        setData(snap);
        setPendingHawala(hawala.pending ?? 0);
        setTodayCashIn(daybook.dailySummary.cashIn || "0.00");
        setTodayCashOut(daybook.dailySummary.cashOut || "0.00");
        const firstCash = daybook.cashPosition[0]?.currencyCode;
        if (firstCash) setBaseCurrency(firstCash);
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
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    const onSaved = () => reloadDashboard();
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, [reloadDashboard]);

  return (
    <div className="dashboard-page page-column workspace-page is-dashboard">
      <div className="stack dashboard-page-body">
        {error ? (
          <PageLoadError message={error} onRetry={reloadDashboard} />
        ) : null}
        {busy && !data ? <p className="muted">{t.common.loading}</p> : null}

        {data ? (
          <DashboardBoard
            data={data}
            pendingHawala={pendingHawala}
            todayCashIn={todayCashIn}
            todayCashOut={todayCashOut}
            baseCurrency={baseCurrency}
            loading={busy}
          />
        ) : null}
      </div>
    </div>
  );
}
