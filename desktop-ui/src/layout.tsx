import { useCallback, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@desktop/auth";
import { GlobalFingerprintListener } from "@desktop/components/global-fingerprint-listener";
import { GlobalSearchOverlay } from "@desktop/components/global-search-overlay";
import { SettingsMenu } from "@desktop/components/settings-menu";
import { QuickActionsBar } from "@desktop/components/quick-actions-bar";
import { RequireScreen } from "@desktop/components/require-screen";
import {
  TransactionDetailModal,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import {
  IconCapital,
  IconCash,
  IconCustomers,
  IconDashboard,
  IconDaybook,
  IconDebtorsCreditors,
  IconExpenses,
  IconHawala,
  IconRefresh,
  IconVault,
} from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { triggerDeskAction } from "@desktop/lib/desk-actions";
import { canAccessPath, pathToScreenId } from "@desktop/lib/permissions";
import { useBackspaceNavigate } from "@desktop/lib/use-backspace-navigate";
import { useDeskAction } from "@desktop/lib/use-desk-action";
import { useGlobalShortcuts } from "@desktop/lib/use-global-shortcuts";

export function AppLayout() {
  const { session } = useAuth();
  const t = useT();
  const location = useLocation();
  const screenId = pathToScreenId(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const remountScreen = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  useDeskAction("refresh", remountScreen);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(".global-search-input");
      input?.focus();
      input?.select();
    });
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const txModal = useTransactionDetailModal();
  const openTx = txModal.open;
  const openTransaction = useCallback(
    (transactionId: string) => {
      void openTx(transactionId);
    },
    [openTx],
  );

  useBackspaceNavigate();
  useGlobalShortcuts({ onOpenSearch: openSearch });

  const canSee = (to: string) => canAccessPath(session, to);

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
    {
      to: "/daybook",
      screen: "daybook",
      label: t.nav.dailyBook,
      icon: <IconDaybook />,
    },
    { to: "/cash", screen: "cash", label: t.nav.cash, icon: <IconCash /> },
    { to: "/vaults", screen: "vaults", label: t.nav.vaults, icon: <IconVault /> },
    {
      to: "/customers",
      screen: "customers",
      label: t.nav.customers,
      icon: <IconCustomers />,
    },
    {
      to: "/debtors-creditors",
      screen: "debtorsCreditors",
      label: t.nav.debtorsCreditors,
      icon: <IconDebtorsCreditors />,
    },
    {
      to: "/hawala",
      screen: "hawala",
      label: t.nav.hawala,
      icon: <IconHawala />,
    },
    {
      to: "/hawala/commission",
      screen: "hawala",
      label: t.nav.commissionTracking,
      icon: <IconHawala />,
    },
    {
      to: "/expenses",
      screen: "expenses",
      label: t.nav.expenses,
      icon: <IconExpenses />,
    },
    {
      to: "/capital",
      screen: "capital",
      label: t.nav.ownerCapital,
      icon: <IconCapital />,
    },
  ].filter((link) => canSee(link.to));

  return (
    <div className="app-frame">
      <div className="app-shell stack" data-screen={screenId}>
        <div className="app-topbar">
          <nav className="app-tabbar" aria-label={t.brand.name}>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                data-nav={link.screen}
                className={({ isActive }) => {
                  const onCommission = location.pathname.startsWith(
                    "/hawala/commission",
                  );
                  const active =
                    link.to === "/hawala"
                      ? isActive && !onCommission
                      : isActive;
                  return active
                    ? "nav-link app-tabbar-link active"
                    : "nav-link app-tabbar-link";
                }}
                title={link.label}
              >
                <span className="nav-link-icon">{link.icon}</span>
                <span className="nav-link-label">{link.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="app-chrome-actions">
            <QuickActionsBar />
            <button
              type="button"
              className="btn primary app-chrome-refresh"
              title={`${t.desk.refresh} (F5)`}
              aria-label={t.desk.refresh}
              onClick={() => {
                if (!triggerDeskAction("refresh")) remountScreen();
              }}
            >
              <IconRefresh />
              <span className="app-chrome-label">{t.desk.refresh}</span>
            </button>
            <SettingsMenu />
          </div>
        </div>
        <main className="app-main stack" key={`${screenId}-${refreshKey}`}>
          <RequireScreen>
            <Outlet />
          </RequireScreen>
        </main>
      </div>
      {searchOpen ? (
        <GlobalSearchOverlay
          onClose={closeSearch}
          onOpenTransaction={openTransaction}
        />
      ) : null}
      <TransactionDetailModal
        detail={txModal.detail}
        busy={txModal.busy}
        error={txModal.error}
        onClose={txModal.close}
      />
      <GlobalFingerprintListener />
    </div>
  );
}
