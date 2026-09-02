import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

import { useT } from "@desktop/i18n";
import { registerOverlayClose } from "@desktop/lib/overlay-stack";

export type NavCurtainLink = {
  to: string;
  screen: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
};

export function NavCurtain({
  open,
  links,
  onClose,
}: {
  open: boolean;
  links: NavCurtainLink[];
  onClose: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  useEffect(() => {
    if (!mounted || open) return;
    const panel = panelRef.current;
    if (!panel) {
      setMounted(false);
      return;
    }
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== panel || e.propertyName !== "transform") return;
      setMounted(false);
    };
    panel.addEventListener("transitionend", onEnd);
    return () => panel.removeEventListener("transitionend", onEnd);
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted) return;
    return registerOverlayClose(onClose);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`nav-curtain${entered ? " is-open" : ""}`}
      role="presentation"
    >
      <div
        className="nav-curtain-backdrop"
        role="presentation"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className="nav-curtain-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.brand.name}
      >
        <nav className="nav-curtain-nav" aria-label={t.brand.name}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              data-nav={link.screen}
              className={({ isActive }) =>
                isActive ? "nav-link nav-curtain-link active" : "nav-link nav-curtain-link"
              }
              onClick={onClose}
            >
              <span className="nav-link-icon">{link.icon}</span>
              <span className="nav-link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
