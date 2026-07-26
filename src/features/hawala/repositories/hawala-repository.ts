import "server-only";

import type {
  HawalaDirection,
  HawalaStatus,
  HawalaTransfer,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateHawalaTransferData = {
  reference: string;
  direction: HawalaDirection;
  status?: HawalaStatus;
  senderName: string;
  senderPhone?: string | null;
  receiverName: string;
  receiverPhone?: string | null;
  partnerSarafi: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  currencyId: string;
  amount: Prisma.Decimal | string | number;
  notes?: string | null;
  customerId?: string | null;
  cashWalletId: string;
  clearingWalletId: string;
  createdById: string;
  valueDate: Date;
};

export type HawalaListOptions = {
  includeDeleted?: boolean;
  status?: HawalaStatus;
  direction?: HawalaDirection;
  customerId?: string;
};

function notDeleted(): Prisma.HawalaTransferWhereInput {
  return { deletedAt: null };
}

export async function createHawalaTransfer(
  data: CreateHawalaTransferData,
): Promise<HawalaTransfer> {
  return prisma.hawalaTransfer.create({
    data: {
      reference: data.reference,
      direction: data.direction,
      status: data.status ?? "PENDING",
      senderName: data.senderName,
      senderPhone: data.senderPhone ?? null,
      receiverName: data.receiverName,
      receiverPhone: data.receiverPhone ?? null,
      partnerSarafi: data.partnerSarafi,
      originCity: data.originCity,
      originCountry: data.originCountry,
      destinationCity: data.destinationCity,
      destinationCountry: data.destinationCountry,
      currencyId: data.currencyId,
      amount: data.amount,
      notes: data.notes ?? null,
      customerId: data.customerId ?? null,
      cashWalletId: data.cashWalletId,
      clearingWalletId: data.clearingWalletId,
      createdById: data.createdById,
      valueDate: data.valueDate,
    },
  });
}

export async function findHawalaTransferById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<HawalaTransfer | null> {
  return prisma.hawalaTransfer.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findHawalaTransferByReference(
  reference: string,
  options: { includeDeleted?: boolean } = {},
): Promise<HawalaTransfer | null> {
  return prisma.hawalaTransfer.findFirst({
    where: {
      reference,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listHawalaTransfers(
  options: HawalaListOptions = {},
): Promise<HawalaTransfer[]> {
  return prisma.hawalaTransfer.findMany({
    where: {
      ...(options.includeDeleted ? {} : notDeleted()),
      ...(options.status ? { status: options.status } : {}),
      ...(options.direction ? { direction: options.direction } : {}),
      ...(options.customerId ? { customerId: options.customerId } : {}),
    },
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function markHawalaCompleted(
  id: string,
  transactionId: string,
  completedAt: Date = new Date(),
): Promise<HawalaTransfer> {
  return prisma.hawalaTransfer.update({
    where: { id },
    data: {
      status: "COMPLETED",
      transactionId,
      completedAt,
      cancelledAt: null,
    },
  });
}

export async function markHawalaCancelled(
  id: string,
  cancelledAt: Date = new Date(),
): Promise<HawalaTransfer> {
  return prisma.hawalaTransfer.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt,
    },
  });
}
