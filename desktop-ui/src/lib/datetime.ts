/** Shared date/time helpers for desk forms. */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
