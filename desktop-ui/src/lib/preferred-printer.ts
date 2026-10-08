/**
 * Machine-local preferred printer for future explicit Print actions.
 * Printer names are Windows-specific, so this stays in localStorage (not shared DB).
 */

const STORAGE_KEY = "saraf.printer.preferred";

/** Currently remembered preferred printer name, or null if unset. */
export function getPreferredPrinterName(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    return raw ? raw : null;
  } catch {
    return null;
  }
}

/** Persist Saraf's preferred printer (or clear with null/empty). */
export function setPreferredPrinterName(name: string | null): void {
  try {
    const trimmed = name?.trim() ?? "";
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
}
