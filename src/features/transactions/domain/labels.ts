import type {
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXCHANGE: "Exchange",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER: "Transfer",
  HAWALA: "Hawala",
  ADJUSTMENT: "Adjustment",
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOIDED: "Voided",
};

/**
 * User-facing type label, including wallet-money adjustments.
 */
export function resolveTransactionTypeLabel(input: {
  type: TransactionType;
  reference?: string | null;
  description?: string | null;
  hawalaDirection?: "SEND" | "RECEIVE" | null;
}): string {
  const reference = input.reference?.trim() ?? "";
  const description = input.description?.trim() ?? "";

  if (input.type === "HAWALA") {
    if (input.hawalaDirection === "SEND") {
      return "Sent Hawala";
    }
    if (input.hawalaDirection === "RECEIVE") {
      return "Received Hawala";
    }
    return "Hawala";
  }

  if (
    input.type === "ADJUSTMENT" &&
    (reference.startsWith("PARTNER-COMM-") ||
      /commission (paid to|collected from)/i.test(description))
  ) {
    if (reference.includes("PAY") || /commission paid to/i.test(description)) {
      return "Partner commission paid";
    }
    return "Partner commission collected";
  }

  if (
    input.type === "ADJUSTMENT" &&
    (reference.startsWith("EXT-MONEY-") ||
      /^external money/i.test(description))
  ) {
    return "External money";
  }

  if (
    input.type === "ADJUSTMENT" &&
    (reference.startsWith("OPEN-WALLET-") ||
      /wallet money/i.test(description) ||
      /customer wallet money/i.test(description))
  ) {
    return "Added to wallet";
  }

  return TRANSACTION_TYPE_LABELS[input.type];
}
