import { NavLink, Outlet } from "react-router-dom";

import {
  IconBuy,
  IconDashboard,
  IconHistory,
  IconInventory,
  IconSell,
} from "@desktop/icons";
import { useT } from "@desktop/i18n";

export function TradingLayout() {
  const t = useT();
  const links = [
    { to: "/trading", label: t.dashboard.overview, end: true, icon: <IconDashboard /> },
    { to: "/trading/buy", label: t.desk.tradingBuy, icon: <IconBuy /> },
    { to: "/trading/sell", label: t.desk.tradingSell, icon: <IconSell /> },
    { to: "/trading/inventory", label: t.desk.inventory, icon: <IconInventory /> },
    { to: "/trading/history", label: t.desk.tradeHistory, icon: <IconHistory /> },
  ];
  return (
    <div className="stack" style={{ gap: "0.65rem" }}>
      <div>
        <h1 style={{ margin: "0 0 0.15rem" }}>{t.nav.trading}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.desk.inventoryCost}
        </p>
      </div>
      <nav className="nav-row" aria-label={t.nav.trading}>
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
      <Outlet />
    </div>
  );
}
