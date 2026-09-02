import "server-only";

import type { PartnerSarafi, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreatePartnerSarafiData = {
  customerId: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isActive?: boolean;
  commissionEnabled?: boolean;
  commissionPerAmount?: Prisma.Decimal | string | number | null;
  commissionFeeAmount?: Prisma.Decimal | string | number | null;
  commissionCurrencyId?: string | null;
};

export type UpdatePartnerSarafiData = {
  customerId?: string | null;
  name?: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isActive?: boolean;
  commissionEnabled?: boolean;
  commissionPerAmount?: Prisma.Decimal | string | number | null;
  commissionFeeAmount?: Prisma.Decimal | string | number | null;
  commissionCurrencyId?: string | null;
  deletedAt?: Date | null;
};

export type PartnerSarafiListOptions = {
  includeDeleted?: boolean;
  isActive?: boolean;
};

function notDeleted(): Prisma.PartnerSarafiWhereInput {
  return { deletedAt: null };
}

export async function createPartnerSarafi(
  data: CreatePartnerSarafiData,
): Promise<PartnerSarafi> {
  return prisma.partnerSarafi.create({
    data: {
      customerId: data.customerId,
      name: data.name,
      phone: data.phone ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive ?? true,
      commissionEnabled: data.commissionEnabled ?? false,
      commissionPerAmount: data.commissionPerAmount ?? null,
      commissionFeeAmount: data.commissionFeeAmount ?? null,
      commissionCurrencyId: data.commissionCurrencyId ?? null,
    },
  });
}

export async function findPartnerSarafiById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<PartnerSarafi | null> {
  return prisma.partnerSarafi.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findLivePartnerByCustomerId(
  customerId: string,
  exceptId?: string,
): Promise<PartnerSarafi | null> {
  return prisma.partnerSarafi.findFirst({
    where: {
      customerId,
      deletedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

export async function findPartnerSarafiByName(
  name: string,
  options: { includeDeleted?: boolean } = {},
): Promise<PartnerSarafi | null> {
  return prisma.partnerSarafi.findFirst({
    where: {
      name: name.trim(),
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listPartnerSarafis(
  options: PartnerSarafiListOptions = {},
): Promise<PartnerSarafi[]> {
  const where: Prisma.PartnerSarafiWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(typeof options.isActive === "boolean"
      ? { isActive: options.isActive }
      : {}),
  };

  return prisma.partnerSarafi.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function updatePartnerSarafi(
  id: string,
  data: UpdatePartnerSarafiData,
): Promise<PartnerSarafi> {
  return prisma.partnerSarafi.update({
    where: { id },
    data: {
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
      ...(typeof data.commissionEnabled === "boolean"
        ? { commissionEnabled: data.commissionEnabled }
        : {}),
      ...(data.commissionPerAmount !== undefined
        ? { commissionPerAmount: data.commissionPerAmount }
        : {}),
      ...(data.commissionFeeAmount !== undefined
        ? { commissionFeeAmount: data.commissionFeeAmount }
        : {}),
      ...(data.commissionCurrencyId !== undefined
        ? { commissionCurrencyId: data.commissionCurrencyId }
        : {}),
      ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt } : {}),
    },
  });
}

export async function softDeletePartnerSarafi(
  id: string,
): Promise<PartnerSarafi> {
  return prisma.partnerSarafi.update({
    where: { id },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });
}
