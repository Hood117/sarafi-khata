/** Shared date/time helpers for desk forms. */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Move an ISO calendar date (YYYY-MM-DD) by `delta` days in local time. */
export function addCalendarDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Human-readable calendar label for desk date pickers (e.g. 12 August 2026). */
export function formatDisplayDate(isoDate: string, intlLocale: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export {
  endSubmit,
  errorMessage,
  logAppError,
  technicalErrorText,
  tryBeginSubmit,
  userFacingError,
} from "@desktop/lib/app-error";
