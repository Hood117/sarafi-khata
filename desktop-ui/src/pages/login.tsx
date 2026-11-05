import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Navigate } from "react-router-dom";

import { getAppInfo, openExternalUrl, type AppInfo } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";
import {
  ArrowLeftRight,
  Banknote,
  Coins,
  Globe,
  Landmark,
  Mail,
  ShieldCheck,
} from "lucide-react";
import radefyWordmark from "@desktop/assets/brand/radefy-systems-wordmark.png";
import afghaniCoin from "@desktop/assets/brand/afghani-five-coin-angled.png";
import { FingerprintScanStage } from "@desktop/components/fingerprint-scan-stage";
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
import { useAuthShellMotion } from "@desktop/lib/use-auth-shell-motion";

type LoginMode = "password" | "fingerprint";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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

  function handleCompanyLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();
    void openExternalUrl(event.currentTarget.href).catch(() => {
      setError(t.login.unableToSignIn);
    });
  }

  function focusPassword() {
    const el = passwordRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }

  function onUsernameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.key !== "Enter" &&
      event.code !== "Enter" &&
      event.code !== "NumpadEnter"
    ) {
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

  // Fingerprint tab: wait on the reader continuously — no Scan button.
  useEffect(() => {
    if (bootstrapping || session || mode !== "fingerprint") return;

    let cancelled = false;
    setError(null);

    void (async () => {
      while (!cancelled) {
        try {
          await loginWithFingerprint();
          if (cancelled) return;
          playFingerprintSound("success");
          return;
        } catch (err: unknown) {
          if (cancelled) return;
          const msg = errorMessage(err, t.login.fingerprintFailed);
          const lower = msg.toLowerCase();
          if (
            lower.includes("timed out") ||
            lower.includes("waiting for a fingerprint") ||
            lower.includes("place a finger")
          ) {
            setError(t.login.fingerprintNoFinger);
            await sleep(2500);
            if (cancelled) return;
            setError(null);
            continue;
          }
          if (isUnmatchedFingerprint(msg) || lower.includes("not recognized")) {
            notifyWrongFingerprint();
            setError(msg);
            await sleep(900);
            if (cancelled) return;
            setError(null);
            continue;
          }
          setError(msg);
          await sleep(
            lower.includes("no fingerprint reader") ||
              lower.includes("no desk users") ||
              lower.includes("not enrolled")
              ? 1800
              : 700,
          );
          if (cancelled) return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapping,
    session,
    mode,
    loginWithFingerprint,
    t.login.fingerprintFailed,
    t.login.fingerprintNoFinger,
  ]);

  if (bootstrapping) {
    return (
      <div ref={shellRef} className="auth-page login-shell radefy-login">
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

  return (
    <div ref={shellRef} className="auth-page login-shell radefy-login">
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
            className="radefy-company-wordmark"
            src={radefyWordmark}
            alt="Radefy Systems"
          />
        </a>
        <div className="radefy-centerpiece">
          <div className="radefy-visual" aria-hidden="true">
            <span className="radefy-orbit orbit-one">
              <ArrowLeftRight />
            </span>
            <span className="radefy-orbit orbit-two">
              <Banknote />
            </span>
            <span className="radefy-orbit orbit-three">
              <Landmark />
            </span>
            <span className="radefy-orbit orbit-four">
              <Coins />
            </span>
            <span className="radefy-orbit orbit-five">
              <ShieldCheck />
            </span>
            <div className="radefy-exchange">
              <img src={afghaniCoin} alt="" className="radefy-afghani-coin" />
            </div>
          </div>
          <div className="radefy-product">
            <span className="eyebrow">RADEFY SYSTEMS · SARAFI</span>
            <h2 dir="ltr">
              Radefy Sarafi
              <br />
              <em>Offline</em>
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
          <h1>{t.login.signIn}</h1>

          <div
            className="login-mode-tabs"
            role="tablist"
            aria-label={t.login.signIn}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "password"}
              className={
                mode === "password"
                  ? "login-mode-tab is-active"
                  : "login-mode-tab"
              }
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
                mode === "fingerprint"
                  ? "login-mode-tab is-active"
                  : "login-mode-tab"
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
              <FingerprintScanStage status={error ? "error" : "scanning"} />
              <p className={error ? "fp-scan-hint is-error" : "fp-scan-hint"}>
                {error || t.login.fingerprintHint}
              </p>
            </div>
          )}
          <div className="radefy-form-footer">
            <ShieldCheck size={15} />
            <span>
              {info
                ? `Radefy Sarafi Offline · v${info.version}`
                : "Radefy Sarafi Offline"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
