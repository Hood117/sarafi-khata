import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { getAppInfo, type AppInfo } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";

export function LoginPage() {
  const { session, bootstrapping, login } = useAuth();
  const t = useT();
  const localeLabels: Record<AppLocale, string> = {
    en: t.settings.languageEnglish,
    fa: t.settings.languageDari,
    ps: t.settings.languagePashto,
  };
  const { locale, setLocale } = useLocale();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void getAppInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  if (bootstrapping) {
    return (
      <div className="login-shell">
        <p className="muted">…</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
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
        <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            {t.login.username}
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.login.usernamePlaceholder}
            />
          </label>
          <label>
            {t.login.password}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.login.passwordPlaceholder}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t.login.signingIn : t.login.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}
