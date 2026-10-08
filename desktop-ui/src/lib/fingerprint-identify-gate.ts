/**
 * Pause the global identify loop while enrollment (or other exclusive
 * fingerprint work) holds the reader. Nested pause/resume is supported.
 */

let pauseDepth = 0;

export function pauseFingerprintIdentify() {
  pauseDepth += 1;
}

export function resumeFingerprintIdentify() {
  pauseDepth = Math.max(0, pauseDepth - 1);
}

export function isFingerprintIdentifyPaused() {
  return pauseDepth > 0;
}
