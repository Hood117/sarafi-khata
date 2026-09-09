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

/** First calendar day of the month containing `isoDay` (YYYY-MM-DD). */
export function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

/** Monday of the ISO calendar week containing `isoDay` (local). */
export function weekStartMonday(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export type DatePeriodPreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "custom";

/** Inclusive from/to range using the same local calendar semantics as Reports / Daybook. */
export function datePeriodRange(
  preset: Exclude<DatePeriodPreset, "custom">,
  today: string,
): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addCalendarDays(today, -1);
      return { from: y, to: y };
    }
    case "week": {
      const from = weekStartMonday(today);
      return { from, to: addCalendarDays(from, 6) };
    }
    case "month":
      return { from: monthStart(today), to: today };
  }
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
