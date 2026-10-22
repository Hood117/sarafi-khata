import {
  useEffect,
  useMemo,
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
import { useAuthShellMotion } from "@desktop/lib/use-auth-shell-motion";

const FINANCE_SYMBOLS = [
  "$",
  "€",
  "£",
  "¥",
  "₣",
  "₨",
  "₦",
  "₹",
  "₩",
  "฿",
  "+",
  "−",
  "؋",
] as const;

type ScatterGlyph = {
  id: number;
  char: string;
  top: number;
  left: number;
  size: number;
  opacity: number;
  rotate: number;
};

type LoginMode = "password" | "fingerprint";

/** Deterministic PRNG so glyphs don't jump on re-render. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildScatterGlyphs(count: number, seed = 0x5a2af): ScatterGlyph[] {
  const rand = mulberry32(seed);
  const glyphs: ScatterGlyph[] = [];
  for (let i = 0; i < count; i++) {
    const sizeRoll = rand();
    const size =
      sizeRoll < 0.45
        ? 18 + rand() * 18
        : sizeRoll < 0.8
          ? 36 + rand() * 28
          : 64 + rand() * 48;
    glyphs.push({
      id: i,
      char: FINANCE_SYMBOLS[Math.floor(rand() * FINANCE_SYMBOLS.length)]!,
      top: rand() * 100,
      left: rand() * 100,
      size,
      opacity: 0.03 + rand() * 0.05,
      rotate: -35 + rand() * 70,
    });
  }
  return glyphs;
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  useAuthShellMotion(shellRef, bootstrapping || Boolean(session));

  const scatter = useMemo(() => buildScatterGlyphs(52), []);

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
      <div ref={shellRef} className="login-shell">
        <div className="login-scatter" aria-hidden="true">
          {scatter.map((g) => (
            <span
              key={g.id}
              className="login-scatter-glyph"
              data-rotate={g.rotate}
              style={{
                top: `${g.top}%`,
                left: `${g.left}%`,
                fontSize: `${g.size}px`,
                opacity: g.opacity,
                transform: `translate(-50%, -50%) rotate(${g.rotate}deg)`,
              }}
            >
              {g.char}
            </span>
          ))}
        </div>
        <p className="muted">…</p>
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
    <div ref={shellRef} className="login-shell">
      <div className="login-scatter" aria-hidden="true">
        {scatter.map((g) => (
          <span
            key={g.id}
            className="login-scatter-glyph"
            data-rotate={g.rotate}
            style={{
              top: `${g.top}%`,
              left: `${g.left}%`,
              fontSize: `${g.size}px`,
              opacity: g.opacity,
              transform: `translate(-50%, -50%) rotate(${g.rotate}deg)`,
            }}
          >
            {g.char}
          </span>
        ))}
      </div>
      <div className="card login-card stack">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            <span className="brand-mark-inner">S</span>
          </div>
          <div>
            <h1 className="login-brand">{t.brand.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {t.login.subtitle}
            </p>
          </div>
        </div>
        {info ? (
          <p className="muted" style={{ margin: 0 }}>
            {info.backend} · v{info.version}
          </p>
        ) : null}
        <label>
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
            <p className="muted" style={{ margin: 0 }}>
              {t.login.fingerprintHint}
            </p>
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
    </div>
  );
}
