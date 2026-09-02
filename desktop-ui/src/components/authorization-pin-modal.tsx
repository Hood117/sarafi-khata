import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { resetAuthPinWithAdminPassword, verifyAdminPassword } from "@desktop/api";
import { clearVaultUnlockSession } from "@desktop/components/vault-unlock-gate";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/app-error";
import { isValidPinDigits, normalizePinDigits, PIN_INPUT_PROPS } from "@desktop/lib/pin-input";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";

type RecoveryStep = "password" | "newPin";

type AuthorizeProps = {
  open: boolean;
  title: string;
  summary: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (pin: string) => void;
};

/** Ask for the System Administrator authorization PIN before a financial write. */
export function AuthorizationPinModal({
  open,
  title,
  summary,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: AuthorizeProps) {
  const t = useT();
  const { session } = useAuth();
  const pinId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"pin" | "recovery">("pin");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("password");
  const [adminPassword, setAdminPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPin("");
      setMode("pin");
      setRecoveryStep("password");
      setAdminPassword("");
      setNewPin("");
      setNewPinConfirm("");
      setLocalError(null);
      setRecoveryBusy(false);
      setRecoverySuccess(null);
      return;
    }
    const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [open]);

  if (!open) return null;

  function submitPin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = normalizePinDigits(pin);
    if (!isValidPinDigits(value)) return;
    onConfirm(value);
  }

  function openRecovery() {
    if (busy || recoveryBusy) return;
    setLocalError(null);
    setRecoverySuccess(null);
    setAdminPassword("");
    setNewPin("");
    setNewPinConfirm("");
    setRecoveryStep("password");
    setMode("recovery");
  }

  function backToPinEntry() {
    if (busy || recoveryBusy) return;
    setMode("pin");
    setRecoveryStep("password");
    setAdminPassword("");
    setNewPin("");
    setNewPinConfirm("");
    setLocalError(null);
  }

  async function continueFromPassword(e: FormEvent) {
    e.preventDefault();
    if (busy || recoveryBusy) return;
    setLocalError(null);
    if (!adminPassword.trim()) {
      setLocalError(t.users.adminPasswordRequired);
      return;
    }
    setRecoveryBusy(true);
    try {
      // UX check only — PIN reset still re-verifies the password in Rust.
      await verifyAdminPassword(adminPassword);
      setRecoveryStep("newPin");
    } catch (err: unknown) {
      setLocalError(errorMessage(err, t.users.adminPasswordRequired));
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function submitRecovery(e: FormEvent) {
    e.preventDefault();
    if (busy || recoveryBusy) return;
    setLocalError(null);
    if (!adminPassword.trim()) {
      setLocalError(t.users.adminPasswordRequired);
      setRecoveryStep("password");
      return;
    }
    const nextPin = normalizePinDigits(newPin);
    const nextConfirm = normalizePinDigits(newPinConfirm);
    if (!isValidPinDigits(nextPin)) {
      setLocalError(t.users.pinMustBeSixDigits);
      return;
    }
    if (nextPin !== nextConfirm) {
      setLocalError(t.users.pinMismatch);
      return;
    }
    setRecoveryBusy(true);
    try {
      await resetAuthPinWithAdminPassword({
        password: adminPassword,
        pin: nextPin,
        pinConfirm: nextConfirm,
        actorUserId: session?.userId ?? null,
      });
      clearVaultUnlockSession();
      setMode("pin");
      setRecoveryStep("password");
      setAdminPassword("");
      setNewPin("");
      setNewPinConfirm("");
      setRecoverySuccess(t.users.authPinRecoverySuccessReturnToPin);
      setPin("");
    } catch (err: unknown) {
      setLocalError(errorMessage(err));
    } finally {
      setRecoveryBusy(false);
    }
  }

  const combinedError = localError || error;
  const formBusy = busy || recoveryBusy;

  if (mode === "recovery") {
    if (recoveryStep === "password") {
      return (
        <Modal
          title={t.users.authPinRecoveryTitle}
          size="md"
          onClose={formBusy ? () => undefined : backToPinEntry}
        >
          <form className="stack" onSubmit={(e) => void continueFromPassword(e)}>
            <p className="muted" style={{ margin: 0 }}>
              {t.users.authPinRecoveryPasswordHint}
            </p>
            <label>
              {t.users.password}
              <input
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                disabled={formBusy}
                required
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </label>
            <ModalErrorBanner message={combinedError} />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={formBusy}
                onClick={backToPinEntry}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={formBusy || !adminPassword.trim()}
              >
                {recoveryBusy ? t.common.loading : t.common.next}
              </button>
            </div>
          </form>
        </Modal>
      );
    }

    return (
      <Modal
        title={t.users.authPinRecoveryTitle}
        size="md"
        onClose={formBusy ? () => undefined : backToPinEntry}
      >
        <form className="stack" onSubmit={(e) => void submitRecovery(e)}>
          <p className="muted" style={{ margin: 0 }}>
            {t.users.authPinRecoverySetNewPinHint}
          </p>
          <label>
            {t.users.authorizationPin}
            <input
              {...PIN_INPUT_PROPS}
              autoComplete="new-password"
              value={newPin}
              disabled={formBusy}
              required
              onChange={(e) => setNewPin(normalizePinDigits(e.target.value))}
            />
          </label>
          <label>
            {t.users.confirmAuthorizationPin}
            <input
              {...PIN_INPUT_PROPS}
              autoComplete="new-password"
              value={newPinConfirm}
              disabled={formBusy}
              required
              onChange={(e) => setNewPinConfirm(normalizePinDigits(e.target.value))}
            />
          </label>
          <ModalErrorBanner message={combinedError} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={formBusy}
              onClick={() => {
                setRecoveryStep("password");
                setLocalError(null);
              }}
            >
              {t.common.back}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={
                formBusy || !isValidPinDigits(newPin) || !isValidPinDigits(newPinConfirm)
              }
            >
              {formBusy ? t.common.saving : t.users.resetAuthPin}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={t.users.authRequiredTitle} size="md" onClose={busy ? () => undefined : onCancel}>
      <form className="stack" onSubmit={(e) => void submitPin(e)}>
        <p style={{ margin: 0, fontWeight: 650 }}>{title}</p>
        <p className="amount-emphasis" style={{ margin: 0 }}>
          {summary}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {t.users.authRequiredHint}
        </p>
        {recoverySuccess ? (
          <p className="badge badge-ok" style={{ margin: 0, width: "fit-content" }}>
            {recoverySuccess}
          </p>
        ) : null}
        <label htmlFor={pinId}>
          {t.users.authorizationPin}
          <input
            {...PIN_INPUT_PROPS}
            id={pinId}
            ref={inputRef}
            value={pin}
            disabled={busy}
            required
            aria-label={t.users.authorizationPin}
            onChange={(e) => setPin(normalizePinDigits(e.target.value))}
          />
        </label>
        <button
          type="button"
          className="link-btn"
          disabled={busy || recoveryBusy}
          onClick={openRecovery}
        >
          {t.users.forgotAuthPin}
        </button>
        <ModalErrorBanner message={combinedError} />
        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !isValidPinDigits(pin)}
          >
            {busy ? t.common.saving : t.common.confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type SetupProps = {
  open: boolean;
  changing: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: { password: string; pin: string; pinConfirm: string }) => void;
};

/** Set or change the System Administrator authorization PIN (after login password). */
export function AuthPinSetupModal({
  open,
  changing,
  busy = false,
  error = null,
  onClose,
  onSubmit,
}: SetupProps) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [step, setStep] = useState<"password" | "pin">("password");
  const [localError, setLocalError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setPin("");
      setPinConfirm("");
      setStep("password");
      setLocalError(null);
      setVerifying(false);
    }
  }, [open]);

  if (!open) return null;

  async function goToPin(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!password.trim()) {
      setLocalError(t.users.adminPasswordRequired);
      return;
    }
    setVerifying(true);
    try {
      await verifyAdminPassword(password);
      setStep("pin");
    } catch (err: unknown) {
      setLocalError(errorMessage(err, t.users.adminPasswordRequired));
    } finally {
      setVerifying(false);
    }
  }

  function finish(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const normalizedPin = normalizePinDigits(pin);
    const normalizedConfirm = normalizePinDigits(pinConfirm);
    if (!isValidPinDigits(normalizedPin)) {
      setLocalError(t.users.pinMustBeSixDigits);
      return;
    }
    if (normalizedPin !== normalizedConfirm) {
      setLocalError(t.users.pinMismatch);
      return;
    }
    onSubmit({ password, pin: normalizedPin, pinConfirm: normalizedConfirm });
  }

  return (
    <Modal
      title={changing ? t.users.changeAuthPin : t.users.setAuthPin}
      size="md"
      onClose={busy || verifying ? () => undefined : onClose}
    >
      {step === "password" ? (
        <form className="stack" onSubmit={(e) => void goToPin(e)}>
          <p className="muted" style={{ margin: 0 }}>
            {t.users.confirmAdminPasswordHint}
          </p>
          <label>
            {t.users.password}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy || verifying}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ModalErrorBanner message={localError || error} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || verifying}
              onClick={onClose}
            >
              {t.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={busy || verifying}>
              {verifying ? t.common.saving : t.common.next}
            </button>
          </div>
        </form>
      ) : (
        <form className="stack" onSubmit={(e) => void finish(e)}>
          <p className="muted" style={{ margin: 0 }}>
            {t.users.createAuthPinHint}
          </p>
          <label>
            {t.users.authorizationPin}
            <input
              {...PIN_INPUT_PROPS}
              autoComplete="new-password"
              value={pin}
              disabled={busy}
              required
              onChange={(e) => setPin(normalizePinDigits(e.target.value))}
            />
          </label>
          <label>
            {t.users.confirmAuthorizationPin}
            <input
              {...PIN_INPUT_PROPS}
              autoComplete="new-password"
              value={pinConfirm}
              disabled={busy}
              required
              onChange={(e) => setPinConfirm(normalizePinDigits(e.target.value))}
            />
          </label>
          <ModalErrorBanner message={localError || error} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setStep("password")}
            >
              {t.common.back}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !isValidPinDigits(pin) || !isValidPinDigits(pinConfirm)}
            >
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

type AdminPasswordConfirmProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
};

/** Prompt for System Administrator login password before saving protected settings. */
export function AdminPasswordConfirmModal({
  open,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: AdminPasswordConfirmProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setLocalError(null);
      return;
    }
    const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [open]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = password.trim();
    if (!value) {
      setLocalError(t.users.adminPasswordRequired);
      return;
    }
    setLocalError(null);
    onConfirm(value);
  }

  return (
    <Modal title={t.users.confirmAdminPasswordHint} size="md" onClose={busy ? () => undefined : onCancel}>
      <form className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>
          {t.users.confirmAdminPasswordToSave}
        </p>
        <label>
          {t.users.password}
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ModalErrorBanner message={localError || error} />
        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !password.trim()}>
            {busy ? t.common.saving : t.common.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
