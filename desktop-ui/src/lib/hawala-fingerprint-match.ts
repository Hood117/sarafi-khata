/** Fired when a finger is identified while the hawala desk is active. */
export const HAWALA_FINGERPRINT_MATCH_EVENT = "desk:hawala-fingerprint-match";

export type HawalaFingerprintMatchDetail = {
  /** Preferred: open this hawala detail directly. */
  hawalaId?: string | null;
  hawalaNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  /** Backend message, e.g. "This hawala was collected with this finger…" */
  message?: string | null;
};

export function dispatchHawalaFingerprintMatch(detail: HawalaFingerprintMatchDetail) {
  window.dispatchEvent(
    new CustomEvent<HawalaFingerprintMatchDetail>(HAWALA_FINGERPRINT_MATCH_EVENT, {
      detail,
    }),
  );
}

export function isHawalaListPath(pathname: string): boolean {
  return pathname === "/hawala" || pathname === "/hawala/";
}

/** Hawala list or detail — not commission tracking. */
export function isHawalaFingerprintPath(pathname: string): boolean {
  if (!pathname.startsWith("/hawala")) return false;
  if (pathname.startsWith("/hawala/commission")) return false;
  return true;
}
