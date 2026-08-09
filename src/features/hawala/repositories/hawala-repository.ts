import "server-only";

import type {
  HawalaDirection,
  HawalaStatus,
  HawalaTransfer,
  PartnerCommissionSide,
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
  partnerSarafiId?: string | null;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  currencyId: string;
  amount: Prisma.Decimal | string | number;
  notes?: string | null;
  customerId?: string | null;
  senderCustomerId?: string | null;
  receiverCustomerId?: string | null;
  cashWalletId: string;
  clearingWalletId: string;
  createdById: string;
  valueDate: Date;
  commissionAmount?: Prisma.Decimal | string | number | null;
  commissionCurrencyId?: string | null;
  commissionSide?: "PAYABLE" | "RECEIVABLE" | null;
  ownCommissionAmount?: Prisma.Decimal | string | number | null;
  commissionRatePerAmount?: Prisma.Decimal | string | number | null;
  commissionRateFeeAmount?: Prisma.Decimal | string | number | null;
};

export type HawalaListOptions = {
  includeDeleted?: boolean;
  /** When true, only soft-deleted (archived) rows. */
  onlyDeleted?: boolean;
  status?: HawalaStatus;
  direction?: HawalaDirection;
  customerId?: string;
  partnerSarafiId?: string;
  /** Inclusive lower bound on `valueDate`. */
  valueDateFrom?: Date;
  /** Exclusive upper bound on `valueDate`. */
  valueDateTo?: Date;
  /** Case-insensitive contains search pushed to SQL (indexed columns + names). */
  search?: string;
  /** 1-based page. */
  page?: number;
  pageSize?: number;
};

export type HawalaListPage = {
  items: HawalaTransfer[];
  total: number;
  page: number;
  pageSize: number;
};

function notDeleted(): Prisma.HawalaTransferWhereInput {
  return { deletedAt: null };
}

function onlyDeleted(): Prisma.HawalaTransferWhereInput {
  return { deletedAt: { not: null } };
}

function buildHawalaListWhere(
  options: HawalaListOptions,
): Prisma.HawalaTransferWhereInput {
  const valueDateFilter: Prisma.DateTimeFilter | undefined =
    options.valueDateFrom || options.valueDateTo
      ? {
          ...(options.valueDateFrom ? { gte: options.valueDateFrom } : {}),
          ...(options.valueDateTo ? { lt: options.valueDateTo } : {}),
        }
      : undefined;

  const search = options.search?.trim();
  const searchFilter: Prisma.HawalaTransferWhereInput | undefined = search
    ? {
        OR: [
          { reference: { contains: search } },
          { senderName: { contains: search } },
          { receiverName: { contains: search } },
          { partnerSarafi: { contains: search } },
          { originCity: { contains: search } },
          { destinationCity: { contains: search } },
        ],
      }
    : undefined;

  return {
    ...(options.onlyDeleted
      ? onlyDeleted()
      : options.includeDeleted
        ? {}
        : notDeleted()),
    ...(options.status ? { status: options.status } : {}),
    ...(options.direction ? { direction: options.direction } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(options.partnerSarafiId
      ? { partnerSarafiId: options.partnerSarafiId }
      : {}),
    ...(valueDateFilter ? { valueDate: valueDateFilter } : {}),
    ...(searchFilter ?? {}),
  };
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
      partnerSarafiId: data.partnerSarafiId ?? null,
      originCity: data.originCity,
      originCountry: data.originCountry,
      destinationCity: data.destinationCity,
      destinationCountry: data.destinationCountry,
      currencyId: data.currencyId,
      amount: data.amount,
      notes: data.notes ?? null,
      customerId: data.customerId ?? null,
      senderCustomerId: data.senderCustomerId ?? null,
      receiverCustomerId: data.receiverCustomerId ?? null,
      cashWalletId: data.cashWalletId,
      clearingWalletId: data.clearingWalletId,
      createdById: data.createdById,
      valueDate: data.valueDate,
      commissionAmount: data.commissionAmount ?? null,
      commissionCurrencyId: data.commissionCurrencyId ?? null,
      commissionSide: data.commissionSide ?? null,
      ownCommissionAmount: data.ownCommissionAmount ?? null,
      commissionRatePerAmount: data.commissionRatePerAmount ?? null,
      commissionRateFeeAmount: data.commissionRateFeeAmount ?? null,
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
    where: buildHawalaListWhere(options),
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Paginated hawala list — filters and LIMIT/OFFSET in SQL so large tables
 * stay responsive (never load the full history into memory).
 */
export async function listHawalaTransfersPage(
  options: HawalaListOptions = {},
): Promise<HawalaListPage> {
  const pageSize = Math.min(
    Math.max(1, Math.floor(options.pageSize ?? 25)),
    100,
  );
  let page = Math.max(1, Math.floor(options.page ?? 1));
  const where = buildHawalaListWhere(options);

  const total = await prisma.hawalaTransfer.count({ where });
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  if (page > totalPages) {
    page = totalPages;
  }

  const items = await prisma.hawalaTransfer.findMany({
    where,
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return { items, total, page, pageSize };
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

export type UpdateHawalaTransferData = {
  reference?: string;
  senderName?: string;
  senderPhone?: string | null;
  receiverName?: string;
  receiverPhone?: string | null;
  partnerSarafi?: string;
  partnerSarafiId?: string | null;
  originCity?: string;
  originCountry?: string;
  destinationCity?: string;
  destinationCountry?: string;
  notes?: string | null;
  senderCustomerId?: string | null;
  receiverCustomerId?: string | null;
  customerId?: string | null;
  valueDate?: Date;
  amount?: Prisma.Decimal | string | number;
  currencyId?: string;
  commissionAmount?: Prisma.Decimal | string | number | null;
  commissionCurrencyId?: string | null;
  commissionSide?: PartnerCommissionSide | null;
  ownCommissionAmount?: Prisma.Decimal | string | number | null;
  commissionRatePerAmount?: Prisma.Decimal | string | number | null;
  commissionRateFeeAmount?: Prisma.Decimal | string | number | null;
  status?: HawalaStatus;
  transactionId?: string | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
};

export async function updateHawalaTransfer(
  id: string,
  data: UpdateHawalaTransferData,
): Promise<HawalaTransfer> {
  return prisma.hawalaTransfer.update({
    where: { id },
    data: {
      ...(data.reference !== undefined ? { reference: data.reference } : {}),
      ...(data.senderName !== undefined ? { senderName: data.senderName } : {}),
      ...(data.senderPhone !== undefined
        ? { senderPhone: data.senderPhone }
        : {}),
      ...(data.receiverName !== undefined
        ? { receiverName: data.receiverName }
        : {}),
      ...(data.receiverPhone !== undefined
        ? { receiverPhone: data.receiverPhone }
        : {}),
      ...(data.partnerSarafi !== undefined
        ? { partnerSarafi: data.partnerSarafi }
        : {}),
      ...(data.partnerSarafiId !== undefined
        ? { partnerSarafiId: data.partnerSarafiId }
        : {}),
      ...(data.originCity !== undefined ? { originCity: data.originCity } : {}),
      ...(data.originCountry !== undefined
        ? { originCountry: data.originCountry }
        : {}),
      ...(data.destinationCity !== undefined
        ? { destinationCity: data.destinationCity }
        : {}),
      ...(data.destinationCountry !== undefined
        ? { destinationCountry: data.destinationCountry }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.senderCustomerId !== undefined
        ? { senderCustomerId: data.senderCustomerId }
        : {}),
      ...(data.receiverCustomerId !== undefined
        ? { receiverCustomerId: data.receiverCustomerId }
        : {}),
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.valueDate !== undefined ? { valueDate: data.valueDate } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.currencyId !== undefined ? { currencyId: data.currencyId } : {}),
      ...(data.commissionAmount !== undefined
        ? { commissionAmount: data.commissionAmount }
        : {}),
      ...(data.commissionCurrencyId !== undefined
        ? { commissionCurrencyId: data.commissionCurrencyId }
        : {}),
      ...(data.commissionSide !== undefined
        ? { commissionSide: data.commissionSide }
        : {}),
      ...(data.ownCommissionAmount !== undefined
        ? { ownCommissionAmount: data.ownCommissionAmount }
        : {}),
      ...(data.commissionRatePerAmount !== undefined
        ? { commissionRatePerAmount: data.commissionRatePerAmount }
        : {}),
      ...(data.commissionRateFeeAmount !== undefined
        ? { commissionRateFeeAmount: data.commissionRateFeeAmount }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.transactionId !== undefined
        ? { transactionId: data.transactionId }
        : {}),
      ...(data.completedAt !== undefined
        ? { completedAt: data.completedAt }
        : {}),
      ...(data.cancelledAt !== undefined
        ? { cancelledAt: data.cancelledAt }
        : {}),
    },
  });
}

export async function softDeleteHawalaTransfer(
  id: string,
): Promise<HawalaTransfer> {
  return prisma.hawalaTransfer.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
}
