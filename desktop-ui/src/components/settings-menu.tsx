import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@desktop/auth";
import {
  ChevronDown,
  Coins,
  Database,
  DatabaseBackup,
  LogOut,
  Repeat2,
  Settings,
  Users,
} from "lucide-react";
import { useT } from "@desktop/i18n";
import { gsap, lockMotion, motionOk, unlockMotion, useGSAP } from "@desktop/lib/motion";
import { registerOverlayClose } from "@desktop/lib/overlay-stack";
import { canAccessPath, canAccessScreen, isAdminRole } from "@desktop/lib/permissions";

type MenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

type SettingsMenuProps = {
  /** Sidebar gear opens the menu upward; header opens downward. */
  variant?: "header" | "sidebar";
};

export function SettingsMenu({ variant = "header" }: SettingsMenuProps) {
  const t = useT();
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const opensUp = variant === "sidebar";

  const close = useCallback(() => setOpen(false), []);

  const placeMenu = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = Math.max(panel?.offsetWidth ?? 0, 216);
    const panelHeight = Math.max(panel?.offsetHeight ?? 0, 120);
    const pad = 8;
    // Prefer aligning to the button; clamp so the panel never clips off-screen (RTL/LTR).
    let left = Math.round(rect.left);
    if (left + panelWidth > window.innerWidth - pad) {
      left = Math.round(rect.right - panelWidth);
    }
    if (left < pad) left = pad;
    if (left + panelWidth > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - panelWidth - pad);
    }
    let top = opensUp
      ? Math.round(rect.top - panelHeight - 8)
      : Math.round(rect.bottom + 8);
    if (opensUp && top < pad) {
      top = Math.min(
        Math.round(rect.bottom + 8),
        Math.max(pad, window.innerHeight - panelHeight - pad),
      );
    }
    if (!opensUp && top + panelHeight > window.innerHeight - pad) {
      top = Math.max(pad, Math.round(rect.top - panelHeight - 8));
    }
    setCoords({ top, left });
  }, [opensUp]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) return false;
      placeMenu();
      return true;
    });
  }, [placeMenu]);

  useEffect(() => {
    if (!open) return;
    return registerOverlayClose(close);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onResize = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close, placeMenu]);

  useEffect(() => {
    close();
  }, [location.pathname, location.search, close]);

  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!open || !panel || !motionOk()) return;
      lockMotion([panel]);
      gsap.set(panel, {
        transformOrigin: opensUp ? "bottom center" : "top center",
      });
      gsap.fromTo(
        panel,
        { opacity: 0, y: opensUp ? 8 : -8, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.28,
          ease: "power3.out",
          overwrite: "auto",
          clearProps: "transform",
          onComplete: () => unlockMotion([panel]),
        },
      );
    },
    { dependencies: [open, opensUp] },
  );

  const go = useCallback(
    (to: string) => {
      close();
      navigate(to);
    },
    [close, navigate],
  );

  /** Desk links for Reports / Employees live in the sidebar, not this menu. */
  const items = useMemo(() => {
    const next: MenuItem[] = [];
    if (canAccessPath(session, "/settings")) {
      next.push({
        id: "general",
        label: t.settings.general,
        icon: <Settings className="nav-icon" size={18} />,
        onSelect: () => go("/settings"),
      });
    }
    if (canAccessPath(session, "/rates")) {
      next.push({
        id: "rates",
        label: t.pages.exchangeRates,
        icon: <Repeat2 className="nav-icon" size={18} />,
        onSelect: () => go("/rates"),
      });
    }
    if (canAccessPath(session, "/settings")) {
      next.push({
        id: "currency",
        label: t.pages.currencies,
        icon: <Coins className="nav-icon" size={18} />,
        onSelect: () => go("/settings?tab=currencies"),
      });
    }
    if (isAdminRole(session) && canAccessScreen(session, "settings")) {
      next.push({
        id: "users",
        label: t.settings.users,
        icon: <Users className="nav-icon" size={18} />,
        onSelect: () => go("/settings?tab=users"),
      });
      next.push({
        id: "backup",
        label: t.settings.backup,
        icon: <DatabaseBackup className="nav-icon" size={18} />,
        onSelect: () => go("/settings?tab=backup"),
      });
      next.push({
        id: "database",
        label: t.settings.database,
        icon: <Database className="nav-icon" size={18} />,
        onSelect: () => go("/settings?tab=database"),
      });
    }
    next.push({
      id: "signout",
      label: t.session.signOut,
      icon: <LogOut className="nav-icon" size={18} />,
      danger: true,
      onSelect: () => {
        close();
        void logout();
      },
    });
    return next;
  }, [session, t, go, close, logout]);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const id = window.requestAnimationFrame(() => placeMenu());
    return () => window.cancelAnimationFrame(id);
  }, [open, placeMenu, items.length]);

  const menu = open
    ? createPortal(
        <div
          ref={panelRef}
          className="settings-menu-panel"
          role="menu"
          aria-label={t.nav.settings}
          style={{ top: coords.top, left: coords.left }}
        >
          {session ? (
            <div className="settings-menu-user" role="presentation">
              <strong>{session.fullName || session.username}</strong>
              <span>
                {session.username}
                {session.role ? ` · ${session.role}` : ""}
              </span>
            </div>
          ) : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={
                item.danger ? "settings-menu-item is-danger" : "settings-menu-item"
              }
              onClick={item.onSelect}
            >
              <span className="settings-menu-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className={
        opensUp ? "settings-menu settings-menu--sidebar" : "settings-menu"
      }
      ref={wrapRef}
    >
      <button
        ref={btnRef}
        type="button"
        className={
          opensUp
            ? "sidebar-footer-link settings-menu-btn settings-menu-btn--sidebar"
            : "settings-menu-btn"
        }
        title={t.nav.settings}
        aria-label={t.nav.settings}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Settings className="nav-icon" size={18} />
        {opensUp ? null : (
          <>
            <span className="app-chrome-label">{t.nav.settings}</span>
            <span className={`settings-menu-chevron${open ? " is-open" : ""}`}>
              <ChevronDown className="nav-icon" size={16} />
            </span>
          </>
        )}
      </button>
      {menu}
    </div>
  );
}
