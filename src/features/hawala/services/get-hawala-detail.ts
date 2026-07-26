import "server-only";

import { findCurrencyById } from "@/features/ledger/repositories/currency-repository";
import {
  HAWALA_DIRECTION_LABELS,
  HAWALA_STATUS_LABELS,
} from "@/features/hawala/domain/labels";
import { HawalaError } from "@/features/hawala/domain/errors";
import type {
  HawalaDetail,
  HawalaTimelineEvent,
} from "@/features/hawala/domain/types";
import { findHawalaTransferById } from "@/features/hawala/repositories/hawala-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { getTransactionDetail } from "@/features/transactions/services/get-transaction-detail";
import { isTransactionError } from "@/features/transactions/domain/transaction-errors";
import { prisma } from "@/server/db";

function buildTimeline(input: {
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  status: HawalaDetail["status"];
}): HawalaTimelineEvent[] {
  const events: HawalaTimelineEvent[] = [
    {
      id: "created",
      label: "Hawala created",
      at: input.createdAt.toISOString(),
      status: "PENDING",
      statusLabel: HAWALA_STATUS_LABELS.PENDING,
    },
  ];

  if (input.completedAt) {
    events.push({
      id: "completed",
      label: "Hawala completed",
      at: input.completedAt.toISOString(),
      status: "COMPLETED",
      statusLabel: HAWALA_STATUS_LABELS.COMPLETED,
    });
  }

  if (input.cancelledAt) {
    events.push({
      id: "cancelled",
      label: "Hawala cancelled",
      at: input.cancelledAt.toISOString(),
      status: "CANCELLED",
      statusLabel: HAWALA_STATUS_LABELS.CANCELLED,
    });
  }

  // If still pending with only the create event, surface current status clearly.
  if (input.status === "PENDING" && events.length === 1) {
    events[0] = {
      ...events[0],
      label: "Hawala pending",
    };
  }

  events.sort(
    (left, right) =>
      new Date(left.at).getTime() - new Date(right.at).getTime(),
  );

  return events;
}

/**
 * Loads hawala business details and reuses getTransactionDetail for the
 * related posted document + ledger lines (no duplicate financial aggregation).
 */
export async function getHawalaDetail(id: string): Promise<HawalaDetail> {
  const hawala = await findHawalaTransferById(id, { includeDeleted: true });
  if (!hawala) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  const [currency, operator] = await Promise.all([
    findCurrencyById(hawala.currencyId, { includeDeleted: true }),
    prisma.user.findUnique({
      where: { id: hawala.createdById },
      select: { fullName: true, username: true },
    }),
  ]);

  const amountDisplay = currency
    ? (formatPrismaAmount(hawala.amount, currency) ?? hawala.amount.toString())
    : hawala.amount.toString();

  let relatedTransaction = null;
  if (hawala.transactionId) {
    try {
      relatedTransaction = await getTransactionDetail(hawala.transactionId);
    } catch (error) {
      if (!(isTransactionError(error) && error.code === "NOT_FOUND")) {
        throw error;
      }
      // Linked id missing — show hawala without related financial section.
      relatedTransaction = null;
    }
  }

  return {
    id: hawala.id,
    reference: hawala.reference,
    direction: hawala.direction,
    directionLabel: HAWALA_DIRECTION_LABELS[hawala.direction],
    status: hawala.status,
    statusLabel: HAWALA_STATUS_LABELS[hawala.status],
    senderName: hawala.senderName,
    senderPhone: hawala.senderPhone,
    receiverName: hawala.receiverName,
    receiverPhone: hawala.receiverPhone,
    partnerSarafi: hawala.partnerSarafi,
    originDisplay: `${hawala.originCity}, ${hawala.originCountry}`,
    destinationDisplay: `${hawala.destinationCity}, ${hawala.destinationCountry}`,
    currencyCode: currency?.code ?? "—",
    amountDisplay,
    notes: hawala.notes,
    operatorName: operator
      ? operator.fullName.trim() || operator.username
      : null,
    valueDate: hawala.valueDate.toISOString(),
    createdAt: hawala.createdAt.toISOString(),
    completedAt: hawala.completedAt?.toISOString() ?? null,
    cancelledAt: hawala.cancelledAt?.toISOString() ?? null,
    timeline: buildTimeline({
      createdAt: hawala.createdAt,
      completedAt: hawala.completedAt,
      cancelledAt: hawala.cancelledAt,
      status: hawala.status,
    }),
    relatedTransaction,
    ledgerEntries: relatedTransaction?.ledgerEntries ?? [],
  };
}
