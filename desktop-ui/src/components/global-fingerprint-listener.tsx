import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getCustomer,
  getHawala,
  identifyFingerprint,
  identifyHawalaCollectorFingerprint,
  type HawalaDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { HawalaFingerprintMatchModal } from "@desktop/components/hawala-fingerprint-match-modal";
import { useT } from "@desktop/i18n";
import { technicalErrorText } from "@desktop/lib/app-error";
import {
  isFingerprintIdentifyPaused,
  pauseFingerprintIdentify,
  resumeFingerprintIdentify,
} from "@desktop/lib/fingerprint-identify-gate";
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
import { isHawalaFingerprintPath } from "@desktop/lib/hawala-fingerprint-match";
import { canAccessPath } from "@desktop/lib/permissions";
import { SuccessModal } from "@desktop/ui/success-modal";

const MATCH_COOLDOWN_MS = 2500;
/** After a placed finger that did not match — brief pause before listening again. */
const RETRY_MS = 700;
/** After idle timeout — rest the reader so the desk stays responsive. */
const IDLE_RETRY_MS = 900;
const BACKOFF_MS = 4000;
/** While enroll/verify holds the reader — poll pause flag gently. */
const PAUSED_POLL_MS = 300;
/** Let the first screen settle before hammering the fingerprint IPC loop. */
const STARTUP_DELAY_MS = 1800;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * App-shell fingerprint identify loop.
 *
 * - On the hawala desk: opens that hawala's full details (like customer page)
 *   and shows a detailed match popup.
 * - Elsewhere: opens that customer's page and shows a success message.
 */
export function GlobalFingerprintListener() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [windowActive, setWindowActive] = useState(
    () => typeof document !== "undefined" && document.hasFocus(),
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTitle, setSuccessTitle] = useState<string | null>(null);
  const [matchedHawala, setMatchedHawala] = useState<HawalaDetail | null>(null);
  const hawalaMode = isHawalaFingerprintPath(location.pathname);
  const enabled = Boolean(
    session &&
      windowActive &&
      (canAccessPath(session, "/customers") ||
        (hawalaMode && canAccessPath(session, "/hawala"))),
  );

  const clearSuccess = useCallback(() => {
    setSuccessMessage(null);
    setSuccessTitle(null);
    setMatchedHawala(null);
  }, []);

  useEffect(() => {
    function onFocus() {
      setWindowActive(true);
    }
    function onBlur() {
      setWindowActive(false);
    }
    function onVisibility() {
      setWindowActive(document.visibilityState === "visible" && document.hasFocus());
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!successMessage && !matchedHawala) return;
    pauseFingerprintIdentify();
    return () => resumeFingerprintIdentify();
  }, [successMessage, matchedHawala]);

  useEffect(() => {
    if (!enabled) return;

    const ac = new AbortController();
    const { signal } = ac;

    void (async () => {
      try {
        await sleep(STARTUP_DELAY_MS, signal);
      } catch {
        return;
      }

      while (!signal.aborted) {
        try {
          while (isFingerprintIdentifyPaused() && !signal.aborted) {
            await sleep(PAUSED_POLL_MS, signal);
          }
          if (signal.aborted) break;

          // Hawala desk: open full hawala details + detailed match popup.
          if (hawalaMode) {
            const hawalaResult = await identifyHawalaCollectorFingerprint();
            if (signal.aborted) break;
            if (isFingerprintIdentifyPaused()) {
              await sleep(PAUSED_POLL_MS, signal);
              continue;
            }

            if (hawalaResult.ok && hawalaResult.hawalaId) {
              playFingerprintSound("success");
              const hawalaId = hawalaResult.hawalaId;
              // Same pattern as customer identify: open the full record page.
              navigate(`/hawala/${hawalaId}`);
              try {
                const detail = await getHawala(hawalaId);
                if (signal.aborted) break;
                setMatchedHawala(detail);
              } catch {
                const number = hawalaResult.hawalaNumber?.trim();
                setSuccessTitle(t.hawala.fingerprintMatchCollected);
                setSuccessMessage(
                  hawalaResult.message?.trim() ||
                    (number
                      ? `${t.hawala.fingerprintMatchCollected} #${number}`
                      : t.hawala.fingerprintMatchCollected),
                );
              }
              await sleep(MATCH_COOLDOWN_MS, signal);
              continue;
            }

            const msg = (hawalaResult.message || "").toLowerCase();
            if (
              msg.includes("no enrolled") ||
              msg.includes("no fingerprint reader") ||
              msg.includes("could not load libzkfp") ||
              msg.includes("no collected hawala")
            ) {
              await sleep(BACKOFF_MS, signal);
            } else if (
              msg.includes("timed out") ||
              msg.includes("capture failed: timed out")
            ) {
              await sleep(IDLE_RETRY_MS, signal);
            } else {
              if (isUnmatchedFingerprint(hawalaResult.message)) {
                notifyWrongFingerprint();
              }
              await sleep(RETRY_MS, signal);
            }
            continue;
          }

          const result = await identifyFingerprint();
          if (signal.aborted) break;

          // Hawala complete / enroll paused us while this identify was in flight.
          if (isFingerprintIdentifyPaused()) {
            await sleep(PAUSED_POLL_MS, signal);
            continue;
          }

          if (result.ok && result.customerId) {
            playFingerprintSound("success");
            const customerId = result.customerId;
            let customerName: string | null = null;
            try {
              const customer = await getCustomer(customerId);
              if (signal.aborted) break;
              customerName = customer.fullName?.trim() || null;
            } catch {
              /* name is optional for success copy */
            }
            if (signal.aborted) break;
            if (isFingerprintIdentifyPaused()) continue;

            navigate(`/customers/${customerId}`);
            if (!isFingerprintIdentifyPaused()) {
              setSuccessTitle(t.customers.identifyMatchTitle);
              setSuccessMessage(
                customerName
                  ? `${t.customers.identifyVerified} — ${customerName}`
                  : t.customers.identifyVerified,
              );
            }
            await sleep(MATCH_COOLDOWN_MS, signal);
            continue;
          }

          const msg = (result.message || "").toLowerCase();
          if (
            msg.includes("no enrolled") ||
            msg.includes("no fingerprint reader") ||
            msg.includes("could not load libzkfp")
          ) {
            await sleep(BACKOFF_MS, signal);
          } else if (
            msg.includes("timed out") ||
            msg.includes("capture failed: timed out")
          ) {
            // Idle window ended with no finger — rest the CPU/driver.
            await sleep(IDLE_RETRY_MS, signal);
          } else {
            // Finger captured but unidentified / no match — not idle timeout.
            if (isUnmatchedFingerprint(result.message)) {
              notifyWrongFingerprint();
            }
            await sleep(RETRY_MS, signal);
          }
        } catch (err: unknown) {
          if (signal.aborted) break;
          const text = technicalErrorText(err);
          if (/ACCESS_DENIED|not allowed|Command not found/i.test(text)) {
            break;
          }
          try {
            await sleep(BACKOFF_MS, signal);
          } catch {
            break;
          }
        }
      }
    })();

    return () => ac.abort();
  }, [
    enabled,
    hawalaMode,
    navigate,
    t.customers.identifyMatchTitle,
    t.customers.identifyVerified,
    t.hawala.fingerprintMatchCollected,
  ]);

  if (matchedHawala) {
    return (
      <HawalaFingerprintMatchModal detail={matchedHawala} onClose={clearSuccess} />
    );
  }

  return successMessage ? (
    <SuccessModal
      title={successTitle || t.common.success}
      message={successMessage}
      onClose={clearSuccess}
      primaryLabel={t.common.close}
    />
  ) : null;
}
