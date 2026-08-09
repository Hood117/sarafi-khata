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
  type AuthSession,
} from "@desktop/api";

/** Persist across app restarts (sessionStorage is cleared every Tauri launch). */
const SESSION_KEY = "saraf.native.session";

function loadSession(): AuthSession | null {
  try {
    // Migrate from older sessionStorage (cleared on every app restart).
    const legacy = sessionStorage.getItem(SESSION_KEY);
    if (legacy && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, legacy);
      sessionStorage.removeItem(SESSION_KEY);
    }
    const raw = localStorage.getItem(SESSION_KEY);
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
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(loadSession()));

  useEffect(() => {
    const existing = loadSession();
    if (!existing?.token) {
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
            // Server rejected the token — clear and show login.
            saveSession(null);
            setSession(null);
            setBootstrapping(false);
            return;
          }
          saveSession(next);
          setSession(next);
          setBootstrapping(false);
        })
        .catch(() => {
          if (cancelled) return;
          // Backend may still be starting after a rebuild — keep local session and retry.
          if (attempts < 8) {
            window.setTimeout(restore, 400 * attempts);
            return;
          }
          // Keep cached session so the user is not bounced to login on transient failures.
          setSession(existing);
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
  }, []);

  const logout = useCallback(async () => {
    const token = session?.token;
    saveSession(null);
    setSession(null);
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
