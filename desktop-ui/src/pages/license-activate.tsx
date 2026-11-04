import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Navigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeftRight,
  Banknote,
  Coins,
  Globe,
  KeyRound,
  Landmark,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

import {
  activateLicense,
  bypassLicenseDev,
  getLicenseStatus,
  openExternalUrl,
  type LicenseStatus,
} from "@desktop/api";
import radefyLogo from "@desktop/assets/brand/radefy-sarafi-logo.png";
import afghaniCoin from "@desktop/assets/brand/afghani-five-coin-angled.png";
import { useLocale, useT } from "@desktop/i18n";
import {
  APP_DEVELOPERS,
  formatWhatsAppDisplay,
} from "@desktop/lib/app-developers";
import { errorMessage } from "@desktop/lib/app-error";
import { useAuthShellMotion } from "@desktop/lib/use-auth-shell-motion";
import { openWhatsApp } from "@desktop/lib/whatsapp";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";

export function LicenseActivatePage() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const localeLabels: Record<AppLocale, string> = {
    en: t.settings.languageEnglish,
    fa: t.settings.languageDari,
    ps: t.settings.languagePashto,
  };
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

  function handleCompanyLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();
    void openExternalUrl(event.currentTarget.href).catch(() => undefined);
  }

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
      <div ref={shellRef} className="auth-page login-shell radefy-login">
        <aside className="auth-aside" />
        <section className="auth-main">
          <p className="muted">{t.license.checking}</p>
        </section>
      </div>
    );
  }

  if (status?.licensed) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div ref={shellRef} className="auth-page login-shell radefy-login radefy-license">
      <aside className="auth-aside radefy-aside">
        <a
          className="radefy-company"
          onClick={handleCompanyLink}
          href="https://www.radefysystems.com/"
          target="_blank"
          rel="noreferrer"
          dir="ltr"
        >
          <img
            src={radefyLogo}
            alt="Radefy Sarafi Offline logo"
            width="42"
            height="42"
          />
          <span>
            <strong>RADEFY</strong>
            <small>SYSTEMS</small>
          </span>
        </a>
        <div className="radefy-centerpiece">
          <div className="radefy-visual" aria-hidden="true">
            <span className="radefy-orbit orbit-one">
              <KeyRound />
            </span>
            <span className="radefy-orbit orbit-two">
              <ShieldCheck />
            </span>
            <span className="radefy-orbit orbit-three">
              <Landmark />
            </span>
            <span className="radefy-orbit orbit-four">
              <Coins />
            </span>
            <span className="radefy-orbit orbit-five">
              <Banknote />
            </span>
            <div className="radefy-exchange">
              <img src={afghaniCoin} alt="" className="radefy-afghani-coin" />
            </div>
          </div>
          <div className="radefy-product">
            <span className="eyebrow">RADEFY SYSTEMS · LICENSE</span>
            <h2 dir="ltr">
              Activate
              <br />
              <em>Sarafi Offline</em>
            </h2>
          </div>
        </div>
        <footer className="radefy-contact" dir="ltr">
          <a
            onClick={handleCompanyLink}
            href="https://www.radefysystems.com/"
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={15} />
            radefysystems.com
          </a>
          <a onClick={handleCompanyLink} href="mailto:hello@radefysystems.com">
            <Mail size={15} />
            hello@radefysystems.com
          </a>
          <small>© {new Date().getFullYear()} Radefy Systems</small>
        </footer>
      </aside>

      <section className="auth-main">
        <div className="auth-form login-card stack">
          <label className="auth-lang">
            {t.settings.language}
            <select
              value={locale}
              onChange={(e) => void setLocale(e.target.value as AppLocale)}
            >
              {APP_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {localeLabels[code]}
                </option>
              ))}
            </select>
          </label>

          <h1>{t.license.activate}</h1>
          <p>{t.license.subtitle}</p>
          <p className="radefy-local">
            <ArrowLeftRight size={14} aria-hidden />
            <span>{t.license.onlineRequired}</span>
          </p>

          {!inDesktop ? <p className="error">{t.license.desktopOnly}</p> : null}

          <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
            <label>
              {t.license.keyLabel}
              <input
                className="ltr-text"
                dir="ltr"
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
              className="btn radefy-license-secondary"
              disabled={!inDesktop || busy}
              onClick={() => void handleDevEnter()}
            >
              {t.license.devEnter}
            </button>
          ) : null}

          <div className="radefy-license-support">
            <p>{t.license.contactForActivation}</p>
            <p className="radefy-license-support-label">{t.license.developerPhones}</p>
            <ul className="radefy-license-phones">
              {APP_DEVELOPERS.map((dev) => (
                <li key={dev.whatsapp}>
                  <button
                    type="button"
                    className="radefy-license-wa"
                    onClick={() => void openWhatsApp(dev.whatsapp, "")}
                    title={t.dashboard.whatsapp}
                  >
                    <MessageCircle size={16} aria-hidden />
                    <span>
                      <strong>{dev.name}</strong>
                      <small dir="ltr">{formatWhatsAppDisplay(dev.whatsapp)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="radefy-form-footer">
            <ShieldCheck size={15} />
            <span>Radefy Sarafi Offline · License</span>
          </div>
        </div>
      </section>
    </div>
  );
}
