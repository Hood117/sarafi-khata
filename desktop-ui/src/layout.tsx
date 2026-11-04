import productLogo from "@desktop/assets/brand/radefy-sarafi-logo.png";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { getBusinessName } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { GlobalFingerprintListener } from "@desktop/components/global-fingerprint-listener";
import { WrongFingerprintToast } from "@desktop/components/wrong-fingerprint-toast";
import { GlobalSearchOverlay } from "@desktop/components/global-search-overlay";
import { SettingsMenu } from "@desktop/components/settings-menu";
import { QuickActionsBar } from "@desktop/components/quick-actions-bar";
import { RequireScreen } from "@desktop/components/require-screen";
import {
  TransactionDetailModal,
  useTransactionDetailModal,
} from "@desktop/components/transaction-detail-modal";
import {
  Banknote,
  BookOpen,
  Building2,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  Percent,
  Receipt,
  Scale,
  Send,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useT } from "@desktop/i18n";
import { canAccessPath, pathToScreenId } from "@desktop/lib/permissions";
import { useBackspaceNavigate } from "@desktop/lib/use-backspace-navigate";
import { useDeskAction } from "@desktop/lib/use-desk-action";
import { useGlobalShortcuts } from "@desktop/lib/use-global-shortcuts";
import { useChromeIntro, usePageMotion } from "@desktop/lib/use-page-motion";
import { useSmoothScroll } from "@desktop/lib/use-smooth-scroll";

type NavItem = {
  to: string;
  screen: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export function AppLayout() {
  const { session } = useAuth();
  const t = useT();
  const location = useLocation();
  const screenId = pathToScreenId(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [businessName, setBusinessName] = useState(t.brand.name);
  const remountScreen = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  useDeskAction("refresh", remountScreen);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        ".global-search-input",
      );
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

  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const routeKey = `${location.pathname}:${refreshKey}`;
  useSmoothScroll(shellRef, routeKey);
  usePageMotion(mainRef, routeKey);

  useEffect(() => {
    void getBusinessName()
      .then((row) => {
        const name = row.businessName?.trim();
        if (name) setBusinessName(name);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  const canSee = (to: string) => canAccessPath(session, to);

  const groups: NavGroup[] = [
    {
      id: "workspace",
      label: "WORKSPACE",
      items: [
        {
          to: "/",
          screen: "dashboard",
          label: t.nav.dashboard,
          end: true,
          icon: <LayoutDashboard className="nav-icon" size={18} />,
        },
        {
          to: "/daybook",
          screen: "daybook",
          label: t.nav.dailyBook,
          icon: <BookOpen className="nav-icon" size={18} />,
        },
        {
          to: "/customers",
          screen: "customers",
          label: t.nav.customers,
          icon: <Users className="nav-icon" size={18} />,
        },
        {
          to: "/cash",
          screen: "cash",
          label: t.nav.cash,
          icon: <Banknote className="nav-icon" size={18} />,
        },
        {
          to: "/vaults",
          screen: "vaults",
          label: t.nav.vaults,
          icon: <Landmark className="nav-icon" size={18} />,
        },
        {
          to: "/debtors-creditors",
          screen: "debtorsCreditors",
          label: t.nav.debtorsCreditors,
          icon: <Scale className="nav-icon" size={18} />,
        },
      ],
    },
    {
      id: "operations",
      label: "OPERATIONS",
      items: [
        {
          to: "/hawala",
          screen: "hawala",
          label: t.nav.hawala,
          icon: <Send className="nav-icon" size={18} />,
        },
        {
          to: "/hawala/commission",
          screen: "commissionTracking",
          label: t.nav.commissionTracking,
          icon: <Percent className="nav-icon" size={18} />,
        },
        {
          to: "/expenses",
          screen: "expenses",
          label: t.nav.expenses,
          icon: <Receipt className="nav-icon" size={18} />,
        },
        {
          to: "/capital",
          screen: "capital",
          label: t.nav.ownerCapital,
          icon: <Wallet className="nav-icon" size={18} />,
        },
        {
          to: "/account-orders",
          screen: "accountOrders",
          label: t.nav.accountOrders,
          icon: <ClipboardList className="nav-icon" size={18} />,
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSee(item.to)),
    }))
    .filter((group) => group.items.length > 0);

  const linkCount = groups.reduce((n, g) => n + g.items.length, 0);
  useChromeIntro(linkCount);

  function isNavActive(to: string, isActive: boolean): boolean {
    if (to === "/hawala") {
      return isActive && !location.pathname.startsWith("/hawala/commission");
    }
    return isActive;
  }

  return (
    <div className="app-frame">
      <div ref={shellRef} className="app-shell stack" data-screen={screenId}>
        <aside className="app-topbar sidebar">
          <NavLink to="/" end className="sidebar-brand brand">
            <span className="brand-mark" aria-hidden>
              <img
                src={productLogo}
                alt=""
                width="32"
                height="32"
                style={{
                  objectFit: "contain",
                  background: "white",
                  borderRadius: 8,
                }}
              />
            </span>
            <span>
              {t.brand.name}
              <span className="brand-sub">BUSINESS WORKSPACE</span>
            </span>
          </NavLink>

          <nav className="app-tabbar" aria-label={t.brand.name}>
            <div className="app-tabbar-track">
              {groups.map((group) => (
                <div className="nav-group" key={group.id}>
                  <p>{group.label}</p>
                  {group.items.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.end}
                      data-nav={link.screen}
                      className={({ isActive }) =>
                        isNavActive(link.to, isActive)
                          ? "nav-link app-tabbar-link active"
                          : "nav-link app-tabbar-link"
                      }
                      title={link.label}
                    >
                      {({ isActive }) => (
                        <>
                          <span className="nav-link-icon">{link.icon}</span>
                          <span className="nav-link-label">{link.label}</span>
                          {isNavActive(link.to, isActive) ? (
                            <span className="nav-active-marker" />
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          <div className="sidebar-footer">
            <ShieldCheck className="nav-icon" size={18} />
            <div>
              Secure workspace
              <small>{session?.role?.toLowerCase() ?? t.common.operator}</small>
            </div>
            <SettingsMenu variant="sidebar" />
          </div>
        </aside>

        <div className="app-workspace">
          <header className="app-header-bar topbar">
            <div
              className="app-header-business"
              aria-label={t.settings.businessName}
              title={businessName}
            >
              <Building2 className="nav-icon" size={18} aria-hidden />
              <span className="app-header-business-name">{businessName}</span>
            </div>
            <div
              className="app-header-actions topbar-actions"
              role="toolbar"
              aria-label={t.dashboard.quickActions}
            >
              <QuickActionsBar />
            </div>
          </header>
          <main
            ref={mainRef}
            className="app-main stack main-content"
            key={`${screenId}-${refreshKey}`}
          >
            <RequireScreen>
              <Outlet />
            </RequireScreen>
          </main>
        </div>
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
      <WrongFingerprintToast />
    </div>
  );
}
