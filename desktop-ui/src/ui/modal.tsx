import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { registerOverlayClose } from "@desktop/lib/overlay-stack";

type ModalSize = "md" | "lg" | "wide" | "xl";

export function Modal({
  title,
  children,
  onClose,
  size = "md",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: ModalSize;
}) {
  useEffect(() => registerOverlayClose(onClose), [onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const sizeClass =
    size === "lg"
      ? " modal-panel-lg"
      : size === "wide"
        ? " modal-panel-wide"
        : size === "xl"
          ? " modal-panel-xl"
          : "";

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-panel card${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body stack">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
