import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { History, LayoutDashboard, Package } from "lucide-react";
import { useT } from "@desktop/i18n";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import type { TradingOutletContext } from "@desktop/pages/trading/outlet-context";

export function TradingLayout() {
  const t = useT();
  const [reloadKey, setReloadKey] = useState(0);

  useDeskDataRefresh(() => {
    setReloadKey((k) => k + 1);
  });

  const links = [
    { to: "/trading", label: t.dashboard.overview, end: true, icon: <LayoutDashboard className="nav-icon" size={18} /> },
    { to: "/trading/inventory", label: t.desk.inventory, icon: <Package className="nav-icon" size={18} /> },
    { to: "/trading/history", label: t.desk.tradeHistory, icon: <History className="nav-icon" size={18} /> },
  ];

  const outletContext: TradingOutletContext = { reloadKey };

  return (
    <div className="stack trading-page workspace-page">
      <div className="records-chrome" style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div className="records-title">
          <div>
            <h2>{t.nav.trading}</h2>
          </div>
          <div className="records-title-actions">
            <nav
              className="settings-tabs currency-panel-tabs"
              aria-label={t.nav.trading}
            >
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `settings-tab${isActive ? " active" : ""}`
                  }
                >
                  <span className="nav-link-icon">{link.icon}</span>
                  <span className="nav-link-label">{link.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </div>
      <Outlet context={outletContext} />
    </div>
  );
}
