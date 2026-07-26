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
