import { useCallback, useEffect, useState } from "react";

import {
  getDashboardSnapshot,
  getDaybookSnapshot,
  type DashboardSnapshot,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import { DashboardBoard } from "@desktop/pages/dashboard-board";
import { PageLoadError } from "@desktop/ui/page-load-error";

export function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [todayCashIn, setTodayCashIn] = useState("0.00");
  const [todayCashOut, setTodayCashOut] = useState("0.00");
  const [baseCurrency, setBaseCurrency] = useState("AFN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const applySnapshots = useCallback(
    (snap: DashboardSnapshot, daybook: Awaited<ReturnType<typeof getDaybookSnapshot>>) => {
      setData(snap);
      setTodayCashIn(daybook.dailySummary.cashIn || "0.00");
      setTodayCashOut(daybook.dailySummary.cashOut || "0.00");
      const firstCash = daybook.cashPosition[0]?.currencyCode;
      if (firstCash) setBaseCurrency(firstCash);
      setError(null);
    },
    [],
  );

  const reloadDashboard = useCallback(() => {
    void Promise.all([getDashboardSnapshot(), getDaybookSnapshot({})])
      .then(([snap, daybook]) => {
        applySnapshots(snap, daybook);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, [applySnapshots, t.errors.loadGeneric]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void Promise.all([getDashboardSnapshot(), getDaybookSnapshot({})])
      .then(([snap, daybook]) => {
        if (cancelled) return;
        applySnapshots(snap, daybook);
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
  }, [applySnapshots, t.errors.loadGeneric]);

  useDeskDataRefresh(reloadDashboard);

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
