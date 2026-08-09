import type { HawalaDirection, HawalaStatus } from "@/generated/prisma/client";

export const HAWALA_DIRECTION_LABELS: Record<HawalaDirection, string> = {
  SEND: "Send",
  RECEIVE: "Receive",
};

export const HAWALA_STATUS_LABELS: Record<HawalaStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
