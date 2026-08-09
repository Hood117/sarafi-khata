/**
 * Shared Next.js searchParams helpers for App Router pages.
 */

export function firstSearchParam(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export function parsePageSearchParam(
  value: string | string[] | undefined,
): number {
  const raw = Number(firstSearchParam(value));
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  return Math.floor(raw);
}
