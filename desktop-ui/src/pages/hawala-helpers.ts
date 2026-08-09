/** Shared Hawala desk UI helpers. */

export { todayIso } from "@desktop/lib/datetime";

export function statusBadgeClass(status: string): string {
  const s = status.trim().toUpperCase();
  switch (s) {
    case "PENDING":
      return "badge badge-pending";
    case "SENT":
      return "badge badge-sent";
    case "RECEIVED":
      return "badge badge-received";
    case "COMPLETED":
      return "badge badge-completed";
    case "CANCELLED":
      return "badge badge-cancelled";
    case "RETURNED":
      return "badge badge-returned";
    default:
      return "badge badge-pending";
  }
}

export function parseMoney(value: string): number {
  const n = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** Resolve FIXED amount or % of principal into a money string. */
export function resolveCommission(
  principal: string,
  mode: "FIXED" | "PERCENT",
  value: string,
): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const v = parseMoney(raw);
  if (v <= 0) return null;
  if (mode === "PERCENT") {
    return formatMoney((parseMoney(principal) * v) / 100);
  }
  return formatMoney(v);
}

export const HAWALA_DRAFT_KEY = "saraf.hawala.draft";

export type HawalaDraft = {
  direction: "SEND" | "RECEIVE";
  reference?: string;
  partnerId?: string;
  partnerBranch?: string;
  currencyCode?: string;
  amount?: string;
  receiveCurrencyCode?: string;
  receiveAmount?: string;
  exchangeRate?: string;
  purpose?: string;
  priority?: string;
  expectedDeliveryDate?: string;
  expectedDeliveryTime?: string;
  valueDate?: string;
  cashWalletId?: string;
  senderMode?: "existing" | "walking";
  senderCustomerId?: string;
  senderName?: string;
  senderPhone?: string;
  senderNationalId?: string;
  senderAddress?: string;
  senderNotes?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverNationalId?: string;
  receiverAddress?: string;
  receiverReference?: string;
  receiverCustomerId?: string;
  receiverMode?: "existing" | "walking";
  country?: string;
  city?: string;
  originCity?: string;
  originCountry?: string;
  destinationCity?: string;
  destinationCountry?: string;
  specialInstructions?: string;
  ownCommissionMode?: "FIXED" | "PERCENT";
  ownCommission?: string;
  partnerCommissionMode?: "FIXED" | "PERCENT";
  partnerCommission?: string;
  additionalCharges?: string;
  discountAmount?: string;
  settlementType?: string;
  settlementNotes?: string;
  internalNotes?: string;
  customerNotes?: string;
  privateNotes?: string;
};

export function readHawalaDraft(): HawalaDraft | null {
  try {
    const raw = sessionStorage.getItem(HAWALA_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HAWALA_DRAFT_KEY);
    return JSON.parse(raw) as HawalaDraft;
  } catch {
    return null;
  }
}

export function writeHawalaDraft(draft: HawalaDraft): void {
  sessionStorage.setItem(HAWALA_DRAFT_KEY, JSON.stringify(draft));
}
