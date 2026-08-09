import "server-only";

import type { Currency, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateCurrencyData = Prisma.CurrencyCreateInput;
export type UpdateCurrencyData = Prisma.CurrencyUpdateInput;

export type CurrencyListOptions = {
  includeDeleted?: boolean;
  isActive?: boolean;
};

function notDeleted(): Prisma.CurrencyWhereInput {
  return { deletedAt: null };
}

export async function createCurrencyRecord(
  data: CreateCurrencyData,
): Promise<Currency> {
  return prisma.currency.create({ data });
}

export async function findCurrencyById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Currency | null> {
  return prisma.currency.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findCurrencyByCode(
  code: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Currency | null> {
  return prisma.currency.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listCurrencies(
  options: CurrencyListOptions = {},
): Promise<Currency[]> {
  const where: Prisma.CurrencyWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(typeof options.isActive === "boolean"
      ? { isActive: options.isActive }
      : {}),
  };

  return prisma.currency.findMany({
    where,
    orderBy: { code: "asc" },
  });
}

export async function updateCurrency(
  id: string,
  data: UpdateCurrencyData,
): Promise<Currency> {
  return prisma.currency.update({
    where: { id },
    data,
  });
}

export async function softDeleteCurrency(id: string): Promise<Currency> {
  const existing = await prisma.currency.findUniqueOrThrow({ where: { id } });

  // Release unique `code` while preserving audit trail of the original code.
  return prisma.currency.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      code: `${existing.code}__deleted__${id}`,
    },
  });
}
