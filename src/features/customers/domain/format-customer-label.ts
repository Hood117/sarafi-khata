/**
 * Display label for customer selects and related screens.
 * Example: "C-001 — Ahmad Karimi" or "Ahmad Karimi" when code is absent.
 */
export function formatCustomerLabel(
  fullName: string,
  code?: string | null,
): string {
  const name = fullName.trim();
  const trimmedCode = code?.trim();

  if (trimmedCode) {
    return `${trimmedCode} — ${name}`;
  }

  return name;
}
