import "server-only";

import type { ExchangeRate, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateExchangeRateData = Prisma.ExchangeRateCreateInput;
export type UpdateExchangeRateData = Prisma.ExchangeRateUpdateInput;

export type ExchangeRateListOptions = {
  includeDeleted?: boolean;
  baseCurrencyId?: string;
  quoteCurrencyId?: string;
  asOf?: Date;
};

function notDeleted(): Prisma.ExchangeRateWhereInput {
  return { deletedAt: null };
}

export async function createExchangeRate(
  data: CreateExchangeRateData,
): Promise<ExchangeRate> {
  return prisma.exchangeRate.create({ data });
}

export async function findExchangeRateById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<ExchangeRate | null> {
  return prisma.exchangeRate.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listExchangeRates(
  options: ExchangeRateListOptions = {},
): Promise<ExchangeRate[]> {
  const where: Prisma.ExchangeRateWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(options.baseCurrencyId
      ? { baseCurrencyId: options.baseCurrencyId }
      : {}),
    ...(options.quoteCurrencyId
      ? { quoteCurrencyId: options.quoteCurrencyId }
      : {}),
    ...(options.asOf ? { effectiveAt: { lte: options.asOf } } : {}),
  };

  return prisma.exchangeRate.findMany({
    where,
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function findLatestExchangeRate(input: {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  asOf?: Date;
}): Promise<ExchangeRate | null> {
  return prisma.exchangeRate.findFirst({
    where: {
      ...notDeleted(),
      baseCurrencyId: input.baseCurrencyId,
      quoteCurrencyId: input.quoteCurrencyId,
      ...(input.asOf ? { effectiveAt: { lte: input.asOf } } : {}),
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateExchangeRate(
  id: string,
  data: UpdateExchangeRateData,
): Promise<ExchangeRate> {
  return prisma.exchangeRate.update({
    where: { id },
    data,
  });
}

export async function softDeleteExchangeRate(id: string): Promise<ExchangeRate> {
  return prisma.exchangeRate.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
}
