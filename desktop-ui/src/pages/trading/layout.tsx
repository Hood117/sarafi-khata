import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import {
  IconDashboard,
  IconHistory,
  IconInventory,
} from "@desktop/icons";
import { useT } from "@desktop/i18n";
import type { TradingOutletContext } from "@desktop/pages/trading/outlet-context";

export function TradingLayout() {
  const t = useT();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onSaved = () => setReloadKey((k) => k + 1);
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, []);

  const links = [
    { to: "/trading", label: t.dashboard.overview, end: true, icon: <IconDashboard /> },
    { to: "/trading/inventory", label: t.desk.inventory, icon: <IconInventory /> },
    { to: "/trading/history", label: t.desk.tradeHistory, icon: <IconHistory /> },
  ];

  const outletContext: TradingOutletContext = { reloadKey };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <nav className="nav-row" aria-label={t.nav.trading} style={{ flex: 1 }}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              <span className="nav-link-icon">{link.icon}</span>
              <span className="nav-link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet context={outletContext} />
    </div>
  );
}
