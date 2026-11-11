import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AlertTriangle, Check, Info } from "lucide-react";
import { useT } from "@desktop/i18n";
import { Modal } from "@desktop/ui/modal";

export type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type AlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
};

type ConfirmDialogApi = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
};

type PendingConfirm = {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  resolve: (value: boolean) => void;
};

type PendingAlert = {
  kind: "alert";
  title: string;
  message: string;
  okLabel: string;
  resolve: () => void;
};

type Pending = PendingConfirm | PendingAlert;

const ConfirmDialogContext = createContext<ConfirmDialogApi | null>(null);

function normalizeConfirm(
  options: ConfirmOptions | string,
  defaults: { title: string; confirmLabel: string; cancelLabel: string },
): Omit<PendingConfirm, "kind" | "resolve"> {
  if (typeof options === "string") {
    return {
      title: defaults.title,
      message: options,
      confirmLabel: defaults.confirmLabel,
      cancelLabel: defaults.cancelLabel,
      tone: "danger",
    };
  }
  return {
    title: options.title?.trim() || defaults.title,
    message: options.message,
    confirmLabel: options.confirmLabel?.trim() || defaults.confirmLabel,
    cancelLabel: options.cancelLabel?.trim() || defaults.cancelLabel,
    tone: options.tone ?? "danger",
  };
}

function normalizeAlert(
  options: AlertOptions | string,
  defaults: { title: string; okLabel: string },
): Omit<PendingAlert, "kind" | "resolve"> {
  if (typeof options === "string") {
    const [first, ...rest] = options.split("\n");
    return {
      title: first?.trim() || defaults.title,
      message: rest.join("\n").trim() || first || "",
      okLabel: defaults.okLabel,
    };
  }
  return {
    title: options.title?.trim() || defaults.title,
    message: options.message,
    okLabel: options.okLabel?.trim() || defaults.okLabel,
  };
}

function ConfirmDialogView({
  pending,
  onConfirm,
  onCancel,
  onAlertOk,
}: {
  pending: Pending;
  onConfirm: () => void;
  onCancel: () => void;
  onAlertOk: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pending.kind === "confirm") confirmRef.current?.focus();
    else okRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
      if (pending.kind === "confirm") onConfirm();
      else onAlertOk();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, onConfirm, onAlertOk]);

  if (pending.kind === "alert") {
    return (
      <Modal title={pending.title} size="md" onClose={onAlertOk}>
        <div className="confirm-modal-body">
          <div className="confirm-modal-icon confirm-modal-icon--info" aria-hidden="true">
            <Info size={28} strokeWidth={2.2} />
          </div>
          <p className="confirm-modal-message">{pending.message}</p>
        </div>
        <div className="modal-actions" style={{ justifyContent: "center" }}>
          <button
            ref={okRef}
            type="button"
            className="btn btn-action btn-action--ok"
            data-desk-action="ok"
            onClick={onAlertOk}
          >
            <Check className="nav-icon" size={18} />
            <span>{pending.okLabel}</span>
          </button>
        </div>
      </Modal>
    );
  }

  const toneClass =
    pending.tone === "danger" ? "confirm-modal-icon--danger" : "confirm-modal-icon--default";
  const confirmBtnClass =
    pending.tone === "danger" ? "btn btn-action btn-action--danger" : "btn btn-action btn-action--ok";

  return (
    <Modal title={pending.title} size="md" onClose={onCancel}>
      <div className="confirm-modal-body">
        <div className={`confirm-modal-icon ${toneClass}`} aria-hidden="true">
          <AlertTriangle size={28} strokeWidth={2.2} />
        </div>
        <p className="confirm-modal-message">{pending.message}</p>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-action btn-action--cancel"
          onClick={onCancel}
        >
          <span>{pending.cancelLabel}</span>
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={confirmBtnClass}
          data-desk-action="ok"
          onClick={onConfirm}
        >
          <Check className="nav-icon" size={18} />
          <span>{pending.confirmLabel}</span>
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const settlePrevious = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    if (current.kind === "confirm") current.resolve(false);
    else current.resolve();
    pendingRef.current = null;
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions | string) => {
      settlePrevious();
      return new Promise<boolean>((resolve) => {
        const next: PendingConfirm = {
          kind: "confirm",
          ...normalizeConfirm(options, {
            title: t.common.confirm,
            confirmLabel: t.common.confirm,
            cancelLabel: t.common.cancel,
          }),
          resolve,
        };
        pendingRef.current = next;
        setPending(next);
      });
    },
    [settlePrevious, t.common.cancel, t.common.confirm],
  );

  const alert = useCallback(
    (options: AlertOptions | string) => {
      settlePrevious();
      return new Promise<void>((resolve) => {
        const next: PendingAlert = {
          kind: "alert",
          ...normalizeAlert(options, {
            title: t.common.success,
            okLabel: t.common.close,
          }),
          resolve,
        };
        pendingRef.current = next;
        setPending(next);
      });
    },
    [settlePrevious, t.common.close, t.common.success],
  );

  const closeConfirm = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current || current.kind !== "confirm") return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(value);
  }, []);

  const closeAlert = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.kind !== "alert") return;
    pendingRef.current = null;
    setPending(null);
    current.resolve();
  }, []);

  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  return (
    <ConfirmDialogContext.Provider value={api}>
      {children}
      {pending ? (
        <ConfirmDialogView
          pending={pending}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
          onAlertOk={closeAlert}
        />
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmDialogApi {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }
  return ctx;
}
