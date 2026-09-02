import { useEffect, useRef } from "react";

type Props = {
  message: string | null | undefined;
};

/**
 * Sticky-looking validation / submit error shown above modal action buttons
 * so it stays visible when the form body scrolls.
 */
export function ModalErrorBanner({ message }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!message) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [message]);

  if (!message) return null;

  return (
    <p ref={ref} className="modal-error-footer" role="alert">
      <span className="modal-error-footer-icon" aria-hidden>
        !
      </span>
      <span className="modal-error-footer-text">{message}</span>
    </p>
  );
}
