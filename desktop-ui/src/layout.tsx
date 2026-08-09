import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@desktop/auth";
import {
  IconCapital,
  IconCash,
  IconCustomers,
  IconDashboard,
  IconDaybook,
  IconExchange,
  IconExpenses,
  IconHawala,
  IconPartners,
  IconRates,
  IconReports,
  IconSettings,
  IconTrading,
  IconTransactions,
  IconVault,
} from "@desktop/icons";
import { useT } from "@desktop/i18n";

function parseAllowedScreens(raw: string | null | undefined): string[] | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

function pathToScreenId(path: string): string {
  if (path === "/") return "dashboard";
  if (path.startsWith("/partners")) return "partners";
  if (path.startsWith("/capital")) return "capital";
  if (path.startsWith("/expenses")) return "expenses";
  if (path.startsWith("/daybook")) return "daybook";
  if (path.startsWith("/vaults")) return "vaults";
  if (path.startsWith("/trading")) return "trading";
  if (path.startsWith("/customers")) return "customers";
  if (path.startsWith("/exchange")) return "exchange";
  if (path.startsWith("/hawala")) return "hawala";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/transactions")) return "transactions";
  if (path.startsWith("/rates")) return "rates";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/cash")) return "cash";
  return path.replace(/^\//, "").split("/")[0] || "dashboard";
}

export function AppLayout() {
  const { session } = useAuth();
  const t = useT();
  const location = useLocation();
  const screenId = pathToScreenId(location.pathname);

  const allowed = parseAllowedScreens(session?.allowedScreens);
  const canSee = (to: string) => {
    // No explicit list stored → full access (legacy / role defaults).
    if (allowed === null) return true;
    if (session?.role?.toUpperCase() === "ADMIN") return true;
    return allowed.includes(pathToScreenId(to));
  };

  const links: Array<{
    to: string;
    screen: string;
    label: string;
    end?: boolean;
    icon: ReactNode;
  }> = [
    {
      to: "/",
      screen: "dashboard",
      label: t.nav.dashboard,
      end: true,
      icon: <IconDashboard />,
    },
    { to: "/cash", screen: "cash", label: t.nav.cash, icon: <IconCash /> },
    {
      to: "/vaults",
      screen: "vaults",
      label: t.nav.vaults,
      icon: <IconVault />,
    },
    {
      to: "/customers",
      screen: "customers",
      label: t.nav.customers,
      icon: <IconCustomers />,
    },
    {
      to: "/exchange",
      screen: "exchange",
      label: t.nav.exchange,
      icon: <IconExchange />,
    },
    {
      to: "/hawala",
      screen: "hawala",
      label: t.nav.hawala,
      icon: <IconHawala />,
    },
    {
      to: "/partners",
      screen: "partners",
      label: t.nav.partnerSarafi,
      icon: <IconPartners />,
    },
    {
      to: "/trading",
      screen: "trading",
      label: t.nav.trading,
      icon: <IconTrading />,
    },
    {
      to: "/capital",
      screen: "capital",
      label: t.nav.ownerCapital,
      icon: <IconCapital />,
    },
    {
      to: "/expenses",
      screen: "expenses",
      label: t.nav.expenses,
      icon: <IconExpenses />,
    },
    {
      to: "/daybook",
      screen: "daybook",
      label: t.nav.dailyBook,
      icon: <IconDaybook />,
    },
    {
      to: "/reports",
      screen: "reports",
      label: t.nav.reports,
      icon: <IconReports />,
    },
    {
      to: "/transactions",
      screen: "transactions",
      label: t.nav.transactions,
      icon: <IconTransactions />,
    },
    {
      to: "/rates",
      screen: "rates",
      label: t.pages.exchangeRates,
      icon: <IconRates />,
    },
    {
      to: "/settings",
      screen: "settings",
      label: t.nav.settings,
      icon: <IconSettings />,
    },
  ].filter((link) => canSee(link.to));

  return (
    <div className="app-shell stack" data-screen={screenId}>
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            <span className="brand-mark-inner">S</span>
          </div>
          <div className="brand-text">
            <div className="brand">{t.brand.name}</div>
            <p className="muted brand-meta">
              {session?.fullName}
              {session?.role ? (
                <>
                  <span className="meta-dot" />
                  {session.role}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-chip" title={t.settings.session}>
            <span className="header-chip-dot" />
            {t.settings.onlineDesk}
          </div>
        </div>
      </header>
      <nav className="nav-row" aria-label={t.brand.name}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            data-nav={link.screen}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span className="nav-link-icon">{link.icon}</span>
            <span className="nav-link-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="app-main stack" key={screenId}>
        <Outlet />
      </main>
    </div>
  );
}
