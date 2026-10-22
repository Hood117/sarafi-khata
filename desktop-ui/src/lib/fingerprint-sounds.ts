import fingerSuccessUrl from "@desktop/assets/sounds/fingerSuccess.mp3";
import registerSuccessUrl from "@desktop/assets/sounds/registerSuccessTone.mp3";
import wrongFingerUrl from "@desktop/assets/sounds/wrongfinger.mp3";

export type FingerprintSound = "success" | "register" | "wrong";

const URLS: Record<FingerprintSound, string> = {
  success: fingerSuccessUrl,
  register: registerSuccessUrl,
  wrong: wrongFingerUrl,
};

export const WRONG_FINGERPRINT_EVENT = "saraf-wrong-fingerprint";

/** Play a short fingerprint cue. Failures are ignored (autoplay / missing file). */
export function playFingerprintSound(kind: FingerprintSound) {
  try {
    const audio = new Audio(URLS[kind]);
    audio.volume = 1;
    void audio.play().catch(() => {
      /* autoplay blocked or decode error — ignore */
    });
  } catch {
    /* ignore */
  }
}

/** True when a scan was taken but did not match an enrolled or previous finger. */
export function isUnmatchedFingerprint(message: string | null | undefined): boolean {
  const msg = (message ?? "").toLowerCase();
  return (
    msg.includes("no match") ||
    msg.includes("unknown finger") ||
    msg.includes("did not match") ||
    msg.includes("does not match")
  );
}

/** Wrong / unmatched finger: error tone plus a toast the shell can show. */
export function notifyWrongFingerprint() {
  playFingerprintSound("wrong");
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WRONG_FINGERPRINT_EVENT));
}
