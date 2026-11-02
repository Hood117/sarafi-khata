import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";

import {
  activateLicense,
  bypassLicenseDev,
  getLicenseStatus,
  type LicenseStatus,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { APP_DEVELOPERS, formatWhatsAppDisplay } from "@desktop/lib/app-developers";
import { errorMessage } from "@desktop/lib/app-error";
import { openWhatsApp } from "@desktop/lib/whatsapp";
import { ArrowLeftRight } from "lucide-react";
import { useAuthShellMotion } from "@desktop/lib/use-auth-shell-motion";

export function LicenseActivatePage() {
  const t = useT();
  const inDesktop = isTauri();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const showForm = !bootstrapping && !status?.licensed;
  useAuthShellMotion(shellRef, showForm);

  const reload = useMemo(
    () => async () => {
      const next = await getLicenseStatus();
      setStatus(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!inDesktop) {
      setError(t.license.desktopOnly);
      setBootstrapping(false);
      return;
    }
    void reload()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, t.license.contactForKey));
        }
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, t.license.contactForKey, t.license.desktopOnly, inDesktop]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!inDesktop) {
      setError(t.license.desktopOnly);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await activateLicense(licenseKey.trim());
      await reload();
    } catch (err: unknown) {
      setError(errorMessage(err, t.license.contactForKey));
    } finally {
      setBusy(false);
    }
  }

  async function handleDevEnter() {
    if (!inDesktop) {
      setError(t.license.desktopOnly);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await bypassLicenseDev();
      await reload();
    } catch (err: unknown) {
      setError(errorMessage(err, t.license.contactForKey));
    } finally {
      setBusy(false);
    }
  }

  if (bootstrapping) {
    return (
      <div ref={shellRef} className="auth-page login-shell">
        <aside className="auth-aside" />
        <section className="auth-main">
          <p className="muted">{t.license.checking}</p>
        </section>
      </div>
    );
  }

  if (status?.licensed && status.reason !== "dev_bypass") {
    return <Navigate to="/login" replace />;
  }

  // Dev bypass: go straight to login (no license file required).
  if (status?.licensed && status.reason === "dev_bypass") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div ref={shellRef} className="auth-page login-shell">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <ArrowLeftRight className="nav-icon" size={23} />
          </span>
          <span>
            {t.brand.name}
            <span className="brand-sub">{t.license.title}</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">{t.license.title}</span>
          <h2>{t.license.subtitle}</h2>
          <p>{t.license.onlineRequired}</p>
        </div>
        <small>{t.license.contactForActivation}</small>
      </aside>
      <section className="auth-main">
      <div className="auth-form login-card stack">
        <span className="eyebrow">{t.license.title}</span>
        <h1>{t.license.activate}</h1>
        <p>{t.license.subtitle}</p>
        <p className="muted" style={{ margin: 0 }}>
          {t.license.onlineRequired}
        </p>

        {!inDesktop ? <p className="error">{t.license.desktopOnly}</p> : null}

        <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            {t.license.keyLabel}
            <input
              autoFocus={inDesktop}
              required
              value={licenseKey}
              placeholder="SARAF-XXXX-XXXX-XXXX"
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              spellCheck={false}
              autoComplete="off"
              disabled={!inDesktop}
            />
          </label>

          {error && inDesktop ? <p className="error">{error}</p> : null}

          <button
            type="submit"
            className="btn primary"
            disabled={!inDesktop || busy || !licenseKey.trim()}
          >
            {busy ? t.license.activating : t.license.activate}
          </button>
        </form>

        {status?.allowDevBypass ? (
          <button
            type="button"
            className="btn"
            disabled={!inDesktop || busy}
            onClick={() => void handleDevEnter()}
          >
            {t.license.devEnter}
          </button>
        ) : null}

        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {t.license.contactForActivation}
        </p>

        <div className="stack" style={{ gap: "0.35rem" }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {t.license.developerPhones}
          </p>
          <ul className="license-dev-phones" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {APP_DEVELOPERS.map((dev) => (
              <li key={dev.whatsapp} style={{ margin: 0 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => void openWhatsApp(dev.whatsapp, "")}
                  title={t.dashboard.whatsapp}
                >
                  {dev.name}: {formatWhatsAppDisplay(dev.whatsapp)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      </section>
    </div>
  );
}
