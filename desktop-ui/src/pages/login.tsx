import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Navigate } from "react-router-dom";

import { getAppInfo, type AppInfo } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";
import { ArrowLeftRight } from "lucide-react";
import { useAuthShellMotion } from "@desktop/lib/use-auth-shell-motion";

type LoginMode = "password" | "fingerprint";

export function LoginPage() {
  const { session, bootstrapping, login, loginWithFingerprint } = useAuth();
  const t = useT();
  const localeLabels: Record<AppLocale, string> = {
    en: t.settings.languageEnglish,
    fa: t.settings.languageDari,
    ps: t.settings.languagePashto,
  };
  const { locale, setLocale } = useLocale();
  const [mode, setMode] = useState<LoginMode>("password");
  /** Desk test / first-run System Administrator credentials. */
  const [username, setUsername] = useState("Saraf@@");
  const [password, setPassword] = useState("Saraf@@!!77");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  useAuthShellMotion(shellRef, bootstrapping || Boolean(session));

  function focusPassword() {
    const el = passwordRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }

  function onUsernameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.code !== "Enter" && event.code !== "NumpadEnter") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusPassword();
  }

  useEffect(() => {
    void getAppInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  if (bootstrapping) {
    return (
      <div ref={shellRef} className="auth-page login-shell">
        <aside className="auth-aside" />
        <section className="auth-main">
          <p className="muted">…</p>
        </section>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const user = username.trim();
    const pass = password;
    if (!user) {
      setError(null);
      usernameRef.current?.focus();
      return;
    }
    if (!pass) {
      setError(null);
      focusPassword();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(user, pass);
    } catch (err: unknown) {
      setError(errorMessage(err, t.login.unableToSignIn));
    } finally {
      setBusy(false);
    }
  }

  async function handleFingerprintSignIn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithFingerprint();
    } catch (err: unknown) {
      setError(errorMessage(err, t.login.fingerprintFailed));
    } finally {
      setBusy(false);
    }
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
            <span className="brand-sub">{t.login.localOnly}</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">{t.login.localOnly}</span>
          <h2>{t.brand.tagline}</h2>
          <p>{t.login.subtitle}</p>
        </div>
        <small>{info ? `${info.backend} · v${info.version}` : t.brand.name}</small>
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
        <span className="eyebrow">{t.login.localOnly}</span>
        <h1>{t.login.signIn}</h1>
        <p>{t.login.subtitle}</p>

        <div className="login-mode-tabs" role="tablist" aria-label={t.login.signIn}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "password"}
            className={mode === "password" ? "login-mode-tab is-active" : "login-mode-tab"}
            onClick={() => {
              setMode("password");
              setError(null);
            }}
          >
            {t.login.modePassword}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "fingerprint"}
            className={
              mode === "fingerprint" ? "login-mode-tab is-active" : "login-mode-tab"
            }
            onClick={() => {
              setMode("fingerprint");
              setError(null);
            }}
          >
            {t.login.modeFingerprint}
          </button>
        </div>

        {mode === "password" ? (
          <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
            <label>
              {t.login.username}
              <input
                ref={usernameRef}
                className="ltr-text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={onUsernameKeyDown}
                placeholder={t.login.usernamePlaceholder}
              />
            </label>
            <label>
              {t.login.password}
              <input
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t.login.passwordPlaceholder}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? t.login.signingIn : t.login.signIn}
            </button>
          </form>
        ) : (
          <div className="stack login-fingerprint-panel">
            {error ? <p className="error">{error}</p> : null}
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void handleFingerprintSignIn()}
            >
              {busy ? t.login.fingerprintScanning : t.login.fingerprintScan}
            </button>
          </div>
        )}
      </div>
      </section>
    </div>
  );
}
