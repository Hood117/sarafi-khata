/**
 * Builds a detail href with a safe same-app `returnTo` query param.
 */
export function hrefWithReturnTo(pathname: string, returnTo: string): string {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  return `${pathname}?${params.toString()}`;
}

/**
 * Accepts only same-origin relative paths for post-navigation return links.
 * Rejects protocol-relative and absolute URLs.
 */
export function resolveSafeReturnTo(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("://")
  ) {
    return fallback;
  }

  return trimmed;
}

export function backLabelForReturnTo(returnTo: string): string {
  if (returnTo.startsWith("/customers/")) {
    return "Back to customer";
  }

  if (returnTo.startsWith("/hawala/")) {
    return "Back to hawala";
  }

  return "Back to transactions";
}
