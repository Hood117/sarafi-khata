import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  currentUser,
  login as apiLogin,
  logout as apiLogout,
  bindSession,
  type AuthSession,
} from "@desktop/api";
import { clearVaultUnlockSession } from "@desktop/components/vault-unlock-gate";

/**
 * Login lasts only while the app is open.
 * sessionStorage is cleared when Tauri fully exits — reopening requires the password.
 * Older builds used localStorage (auto-login); that is cleared on start.
 */
const SESSION_KEY = "saraf.native.session";

function clearPersistedLogin() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function readRuntimeSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession | null) {
  try {
    clearPersistedLogin();
    if (!session) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage full / blocked — keep in-memory session only
  }
}

type AuthContextValue = {
  session: AuthSession | null;
  bootstrapping: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    clearPersistedLogin();

    // Soft SPA reload within the same app run can keep sessionStorage.
    const existing = readRuntimeSession();
    if (!existing?.token) {
      setSession(null);
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const restore = () => {
      attempts += 1;
      void currentUser(existing.token)
        .then((next) => {
          if (cancelled) return;
          if (!next) {
            if (attempts < 5) {
              window.setTimeout(restore, 300 * attempts);
              return;
            }
            saveSession(null);
            setSession(null);
            setBootstrapping(false);
            return;
          }
          saveSession(next);
          setSession(next);
          void bindSession(next.token);
          setBootstrapping(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempts < 8) {
            window.setTimeout(restore, 400 * attempts);
            return;
          }
          saveSession(null);
          setSession(null);
          setBootstrapping(false);
        });
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const next = await apiLogin(username, password);
    saveSession(next);
    setSession(next);
    void bindSession(next.token);
  }, []);

  const logout = useCallback(async () => {
    const token = session?.token;
    saveSession(null);
    clearVaultUnlockSession();
    setSession(null);
    void bindSession(null);
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        // local sign-out already done
      }
    }
  }, [session?.token]);

  const value = useMemo(
    () => ({ session, bootstrapping, login, logout }),
    [session, bootstrapping, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
