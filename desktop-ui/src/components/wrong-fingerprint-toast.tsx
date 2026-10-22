import { useEffect, useRef, useState } from "react";

import { useT } from "@desktop/i18n";
import { WRONG_FINGERPRINT_EVENT } from "@desktop/lib/fingerprint-sounds";

const TOAST_MS = 3200;

/** Red accent toast shown when a scanned finger does not match. */
export function WrongFingerprintToast() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    function onWrong() {
      setOpen(true);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setOpen(false);
      }, TOAST_MS);
    }
    window.addEventListener(WRONG_FINGERPRINT_EVENT, onWrong);
    return () => {
      window.removeEventListener(WRONG_FINGERPRINT_EVENT, onWrong);
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fp-wrong-toast" role="alert">
      <span className="fp-wrong-toast-accent" aria-hidden />
      <span className="fp-wrong-toast-mark" aria-hidden>
        !
      </span>
      <span className="fp-wrong-toast-text">{t.customers.wrongFingerToast}</span>
    </div>
  );
}
