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
  if (returnTo === "/" || returnTo.startsWith("/?")) {
    return "Back to dashboard";
  }

  if (returnTo.startsWith("/customers/")) {
    return "Back to customer";
  }

  if (returnTo.startsWith("/hawala/")) {
    return "Back to hawala";
  }

  if (
    returnTo === "/exchange" ||
    returnTo.startsWith("/exchange?") ||
    returnTo.startsWith("/exchange/")
  ) {
    return "Back to exchange";
  }

  if (
    returnTo === "/transfers" ||
    returnTo.startsWith("/transfers?") ||
    returnTo.startsWith("/transfers/")
  ) {
    return "Back to transfers";
  }

  if (
    returnTo === "/reports" ||
    returnTo.startsWith("/reports?") ||
    returnTo.startsWith("/reports/")
  ) {
    return "Back to reports";
  }

  if (
    returnTo === "/audit" ||
    returnTo.startsWith("/audit?") ||
    returnTo.startsWith("/audit/")
  ) {
    return "Back to audit";
  }

  return "Back to transactions";
}
