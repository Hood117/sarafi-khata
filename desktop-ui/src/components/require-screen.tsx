import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  canAccessPath,
  firstAllowedPath,
  pathToScreenId,
} from "@desktop/lib/permissions";

/** Block direct navigation to screens the user is not allowed to open. */
export function RequireScreen({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const t = useT();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (canAccessPath(session, location.pathname)) {
    return children;
  }

  const fallback = firstAllowedPath(session);
  // If even the fallback is denied (empty rights), show access denied in place.
  if (fallback === location.pathname || !canAccessPath(session, fallback)) {
    return (
      <div className="stack" style={{ padding: "1.5rem", gap: "0.75rem" }}>
        <h1 style={{ margin: 0 }}>{t.common.accessDeniedTitle}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.common.accessDeniedHint.replace(
            "{screen}",
            pathToScreenId(location.pathname),
          )}
        </p>
      </div>
    );
  }

  return <Navigate to={fallback} replace />;
}
