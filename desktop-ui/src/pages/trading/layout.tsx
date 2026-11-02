import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { History, LayoutDashboard, Package } from "lucide-react";
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
    { to: "/trading", label: t.dashboard.overview, end: true, icon: <LayoutDashboard className="nav-icon" size={18} /> },
    { to: "/trading/inventory", label: t.desk.inventory, icon: <Package className="nav-icon" size={18} /> },
    { to: "/trading/history", label: t.desk.tradeHistory, icon: <History className="nav-icon" size={18} /> },
  ];

  const outletContext: TradingOutletContext = { reloadKey };

  return (
    <div className="stack trading-page workspace-page">
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
