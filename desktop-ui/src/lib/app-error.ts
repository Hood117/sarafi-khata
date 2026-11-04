/** Map technical failures to user-facing copy and keep raw details for logs. */

export type ErrorMessages = {
  genericTryAgain: string;
  databaseBusy: string;
  databaseUnavailable: string;
  constraint: string;
  duplicateReference: string;
  relatedMissing: string;
};

/** English defaults so invoke/global handlers work before i18n is ready. */
export const EN_ERROR_MESSAGES: ErrorMessages = {
  genericTryAgain: "Something went wrong. Please try again.",
  databaseBusy: "The database is busy. Please try again.",
  databaseUnavailable: "Could not reach the database. Please try again.",
  constraint: "This record conflicts with an existing one. No changes were made.",
  duplicateReference:
    "Could not save. The system tried to reuse an existing transaction number. No changes were made.",
  relatedMissing:
    "Could not complete this operation because a related record is missing. No changes were made.",
};

const DESKTOP_APP_REQUIRED =
  /DESKTOP_APP_REQUIRED|Cannot read properties of undefined \(reading ['"]invoke['"]\)|__TAURI_INTERNALS__/i;

export function technicalErrorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; error?: unknown };
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
    try {
      return JSON.stringify(err);
    } catch {
      /* ignore */
    }
  }
  return String(err);
}

export function logAppError(context: string, err: unknown): void {
  const technical = technicalErrorText(err);
  console.error(`[saraf] ${context}: ${technical}`, err);
}

const UNIQUE_TX_REF =
  /unique_tx_reference|unique constraint failed:\s*transaction\.reference/i;
const SQLITE_BUSY = /database_busy|sqlite_busy|database is locked|database is busy/i;
const SQLITE_FK = /sqlite_fk|foreign key/i;
const SQLITE_CONSTRAINT =
  /sqlite_constraint|unique constraint|constraint failed|constraint violation/i;
const DB_UNAVAILABLE =
  /database_unavailable|unable to open database|disk i\/o error|database disk image|not a database/i;
const TECHNICAL_LEAK =
  /unique_tx_reference|database_busy|sqlite_|rusqlite|constraint failed|database is locked|invokeerror|panic|stack trace|os error \d+|error code/i;

function isLikelyUserMessage(raw: string): boolean {
  const text = raw.trim();
  if (!text || text.length > 220 || text.includes("\n")) return false;
  if (TECHNICAL_LEAK.test(text)) return false;
  return /[A-Za-z\u0600-\u06FF]/.test(text);
}

/**
 * Convert a caught error into copy the cashier can act on.
 * Technical text is logged; UNIQUE Transaction.reference is reported as a
 * reference-reuse bug rather than a generic save failure.
 */
export function userFacingError(
  err: unknown,
  fallback?: string,
  copy: ErrorMessages = EN_ERROR_MESSAGES,
): string {
  const raw = technicalErrorText(err);
  if (DESKTOP_APP_REQUIRED.test(raw)) {
    const after = raw.match(/^DESKTOP_APP_REQUIRED:\s*(.+)$/i);
    return (
      after?.[1]?.trim() ||
      "Open Radefy Sarafi Offline from the desktop app window, not a web browser."
    );
  }
  if (UNIQUE_TX_REF.test(raw)) return copy.duplicateReference;
  if (SQLITE_BUSY.test(raw)) return copy.databaseBusy;
  if (SQLITE_FK.test(raw)) return copy.relatedMissing;
  if (SQLITE_CONSTRAINT.test(raw)) return copy.constraint;
  if (DB_UNAVAILABLE.test(raw)) return copy.databaseUnavailable;
  // Auth PIN codes: strip prefix, keep human message after ": ".
  const authPin = raw.match(
    /^AUTH_PIN_(?:NOT_SET|INVALID|LOCKED|REQUIRED):\s*(.+)$/i,
  );
  if (authPin?.[1]) return authPin[1].trim();
  const accessDenied = raw.match(/^ACCESS_DENIED:\s*(.+)$/i);
  if (accessDenied?.[1]) return accessDenied[1].trim();
  if (isLikelyUserMessage(raw)) return raw.trim();
  return fallback?.trim() || copy.genericTryAgain;
}

/** Drop-in replacement for raw `err.message` in UI catch blocks. */
export function errorMessage(err: unknown, fallback?: string): string {
  logAppError("ui", err);
  return userFacingError(err, fallback);
}

/** Immediate lock so a second Save click cannot start another financial write. */
export function tryBeginSubmit(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function endSubmit(lock: { current: boolean }): void {
  lock.current = false;
}
