import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getCashTracking, setCashTracking as persistCashTracking } from "@desktop/api";
import { useAuth } from "@desktop/auth";

type CashTrackingContextValue = {
  /** True when shop cash / Main Vault tracking is enabled (default). */
  cashTrackingEnabled: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  setCashTrackingEnabled: (enabled: boolean) => Promise<void>;
};

const CashTrackingContext = createContext<CashTrackingContextValue | null>(null);

export function CashTrackingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [cashTrackingEnabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setEnabled(true);
      setReady(true);
      return;
    }
    try {
      const row = await getCashTracking();
      setEnabled(row.cashTracking !== "off");
    } catch {
      setEnabled(true);
    } finally {
      setReady(true);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setCashTrackingEnabled = useCallback(async (enabled: boolean) => {
    const saved = await persistCashTracking(enabled ? "on" : "off");
    setEnabled(saved.cashTracking !== "off");
  }, []);

  const value = useMemo(
    () => ({
      cashTrackingEnabled,
      ready,
      refresh,
      setCashTrackingEnabled,
    }),
    [cashTrackingEnabled, ready, refresh, setCashTrackingEnabled],
  );

  return (
    <CashTrackingContext.Provider value={value}>{children}</CashTrackingContext.Provider>
  );
}

export function useCashTracking(): CashTrackingContextValue {
  const ctx = useContext(CashTrackingContext);
  if (!ctx) {
    return {
      cashTrackingEnabled: true,
      ready: true,
      refresh: async () => undefined,
      setCashTrackingEnabled: async () => undefined,
    };
  }
  return ctx;
}

/** Shared gate for nav / widgets — prefer the hook when inside the provider. */
export function isCashTrackingEnabled(value: boolean | undefined | null): boolean {
  return value !== false;
}
