import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { registerOverlayClose } from "@desktop/lib/overlay-stack";
import { useOverlayMotion } from "@desktop/lib/use-overlay-motion";

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
  const { backdropRef, panelRef, requestClose } = useOverlayMotion(onClose);
  useEffect(() => registerOverlayClose(requestClose), [requestClose]);

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
      ref={backdropRef}
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel card${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body stack">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
