/**
 * Client-side text filter for report rows using the `q` / search filter.
 */
export function matchesReportSearch(
  search: string | null | undefined,
  ...parts: Array<string | number | null | undefined>
): boolean {
  const query = (search ?? "").trim().toLowerCase();
  if (!query) {
    return true;
  }

  return parts.some((part) => {
    if (part == null) {
      return false;
    }
    return String(part).toLowerCase().includes(query);
  });
}
