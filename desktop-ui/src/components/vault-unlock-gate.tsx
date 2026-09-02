import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { verifyAuthorizationPin } from "@desktop/api";
import { AuthorizationPinModal } from "@desktop/components/authorization-pin-modal";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/app-error";

const STORAGE_KEY = "saraf.mainVaultUnlocked";

export function clearVaultUnlockSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeUnlocked() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Require authorization PIN before showing Main Vault content. Unlock lasts for the browser session. */
export function VaultUnlockGate({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(readUnlocked);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  async function confirmWithPin(pin: string) {
    setPinBusy(true);
    setPinError(null);
    try {
      await verifyAuthorizationPin(pin);
      writeUnlocked();
      setUnlocked(true);
    } catch (err: unknown) {
      setPinError(errorMessage(err, t.users.authRequiredHint));
    } finally {
      setPinBusy(false);
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="stack">
      <article className="card stack">
        <h2 style={{ margin: 0 }}>{t.desk.vaultUnlockTitle}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t.desk.vaultUnlockHint}
        </p>
      </article>
      <AuthorizationPinModal
        open
        title={t.users.authRequiredTitle}
        summary={t.desk.vaultUnlockTitle}
        busy={pinBusy}
        error={pinError}
        onCancel={() => {
          if (!pinBusy) navigate("/", { replace: true });
        }}
        onConfirm={(pin) => void confirmWithPin(pin)}
      />
    </div>
  );
}
