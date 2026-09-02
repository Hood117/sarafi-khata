import type { Dictionary } from "@/lib/i18n/messages/types";

/** Translate stored status codes for display. Never mix languages. */
export function statusLabel(t: Dictionary, status: string | null | undefined): string {
  const key = (status ?? "").trim().toUpperCase();
  switch (key) {
    case "PENDING":
      return t.status.pending;
    case "SENT":
      return t.status.sent;
    case "RECEIVED":
      return t.status.received;
    case "COMPLETED":
      return t.status.completed;
    case "CANCELLED":
    case "CANCELED":
      return t.status.cancelled;
    case "RETURNED":
      return t.status.returned;
    case "POSTED":
      return t.status.posted;
    case "VOID":
    case "VOIDED":
      return t.status.voided;
    case "DRAFT":
      return t.status.draft;
    case "OPEN":
      return t.status.open;
    case "CLOSED":
      return t.status.closed;
    case "BUY":
      return t.status.buy;
    case "SELL":
      return t.status.sell;
    case "PAYABLE":
      return t.status.payable;
    case "RECEIVABLE":
      return t.status.receivable;
    default:
      return status?.trim() || t.common.unknown;
  }
}

/** Translate stored transaction type codes for display. */
export function transactionTypeLabel(
  t: Dictionary,
  type: string | null | undefined,
): string {
  switch ((type ?? "").trim().toUpperCase()) {
    case "DEPOSIT":
      return t.txLine.typeDeposit;
    case "WITHDRAWAL":
      return t.txLine.typeWithdrawal;
    case "EXCHANGE":
      return t.txLine.typeExchange;
    case "HAWALA":
      return t.txLine.typeHawala;
    case "TRANSFER":
      return t.txLine.typeTransfer;
    case "TRADE_BUY":
      return t.txLine.typeTradeBuy;
    case "TRADE_SELL":
      return t.txLine.typeTradeSell;
    case "ADJUSTMENT":
      return t.txLine.typeAdjustment;
    case "VAULT_CASH_IN":
      return t.desk.cashIn;
    case "VAULT_CASH_OUT":
      return t.desk.cashOut;
    case "EXPENSE":
      return t.txLine.typeExpense;
    case "OPENING":
      return t.txLine.openingBalance.replace(/^·\s*/, "");
    default:
      return type?.trim() || t.common.unknown;
  }
}

export function localeDisplayName(t: Dictionary, locale: "en" | "fa" | "ps"): string {
  if (locale === "fa") return t.settings.languageDari;
  if (locale === "ps") return t.settings.languagePashto;
  return t.settings.languageEnglish;
}

/** Translate stored hawala purpose codes for display. Values sent to API stay English. */
export function purposeLabel(
  t: Dictionary,
  purpose: string | null | undefined,
): string {
  switch ((purpose ?? "").trim()) {
    case "Family":
      return t.desk.family;
    case "Business":
      return t.desk.business;
    case "Medical":
      return t.desk.medical;
    case "Education":
      return t.desk.education;
    case "Salary":
      return t.desk.salary;
    case "Trade":
      return t.desk.trade;
    case "Investment":
      return t.desk.investment;
    case "Other":
      return t.desk.other;
    default:
      return purpose?.trim() || "—";
  }
}

/** Translate stored settlement type codes for display. Values sent to API stay English. */
export function settlementLabel(
  t: Dictionary,
  settlement: string | null | undefined,
): string {
  switch ((settlement ?? "").trim()) {
    case "Cash":
      return t.desk.settlementCash;
    case "Partner Balance":
      return t.desk.settlementPartner;
    case "Customer Deposit":
      return t.desk.settlementDeposit;
    case "Internal Adjustment":
      return t.desk.settlementInternal;
    default:
      return settlement?.trim() || "—";
  }
}
