import "server-only";

/** Sliding session lifetime shared by DB rows and cookie maxAge. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export const SESSION_COOKIE_NAME = "saraf_session";

/**
 * Offline Tauri serves the app over local HTTP. Secure cookies are dropped on
 * non-HTTPS origins, so Secure is opt-in via env for HTTPS deployments only.
 */
export function shouldUseSecureSessionCookie() {
  return process.env.SESSION_COOKIE_SECURE === "true";
}
