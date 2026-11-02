import { useEffect, useRef } from "react";

import { Check } from "lucide-react";
import { Modal } from "@desktop/ui/modal";

export function SuccessModal({
  title = "Success",
  message,
  onClose,
  primaryLabel = "OK",
}: {
  title?: string;
  message: string;
  onClose: () => void;
  primaryLabel?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA") return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <Modal title={title} size="md" onClose={onClose}>
      <div className="success-modal-body">
        <div className="success-check" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="64" height="64">
            <circle className="success-check-circle" cx="26" cy="26" r="24" fill="none" />
            <path
              className="success-check-mark"
              fill="none"
              d="M14.5 27.2l7.2 7.2 15.8-16.4"
            />
          </svg>
        </div>
        <p className="success-modal-message">{message}</p>
      </div>
      <div className="modal-actions" style={{ justifyContent: "center" }}>
        <button
          ref={closeRef}
          type="button"
          className="btn btn-action btn-action--ok"
          data-desk-action="ok"
          onClick={onClose}
        >
          <Check className="nav-icon" size={18} />
          <span>{primaryLabel}</span>
        </button>
      </div>
    </Modal>
  );
}
