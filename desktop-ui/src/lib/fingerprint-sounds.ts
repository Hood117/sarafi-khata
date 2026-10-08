import fingerSuccessUrl from "@desktop/assets/sounds/fingerSuccess.mp3";
import registerSuccessUrl from "@desktop/assets/sounds/registerSuccessTone.mp3";
import wrongFingerUrl from "@desktop/assets/sounds/wrongfinger.mp3";

export type FingerprintSound = "success" | "register" | "wrong";

const URLS: Record<FingerprintSound, string> = {
  success: fingerSuccessUrl,
  register: registerSuccessUrl,
  wrong: wrongFingerUrl,
};

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
