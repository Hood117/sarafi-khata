import "server-only";

import type { ExchangeRate, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * Feature repository for exchange rates.
 * Uses the same Prisma `ExchangeRate` model as the ledger data layer.
 * Active status maps to `deletedAt` (null = active).
 */

export type ExchangeRateWithCurrencies = ExchangeRate & {
  baseCurrency: { id: string; code: string; name: string };
  quoteCurrency: { id: string; code: string; name: string };
};

export type CreateExchangeRateRecordData = {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: Prisma.Decimal | string;
  effectiveAt: Date;
  source?: string | null;
  /** When false, the row is created soft-deleted (inactive). */
  isActive?: boolean;
};

export type ExchangeRateListOptions = {
  includeInactive?: boolean;
  baseCurrencyId?: string;
  quoteCurrencyId?: string;
  asOf?: Date;
};

function notDeleted(): Prisma.ExchangeRateWhereInput {
  return { deletedAt: null };
}

export async function createExchangeRateRecord(
  data: CreateExchangeRateRecordData,
): Promise<ExchangeRate> {
  const isActive = data.isActive ?? true;

  return prisma.exchangeRate.create({
    data: {
      rate: data.rate,
      effectiveAt: data.effectiveAt,
      source: data.source ?? null,
      deletedAt: isActive ? null : new Date(),
      baseCurrency: { connect: { id: data.baseCurrencyId } },
      quoteCurrency: { connect: { id: data.quoteCurrencyId } },
    },
  });
}

export async function findExchangeRateById(
  id: string,
  options: { includeInactive?: boolean } = {},
): Promise<ExchangeRate | null> {
  return prisma.exchangeRate.findFirst({
    where: {
      id,
      ...(options.includeInactive ? {} : notDeleted()),
    },
  });
}

export async function findExchangeRateWithCurrenciesById(
  id: string,
  options: { includeInactive?: boolean } = {},
): Promise<ExchangeRateWithCurrencies | null> {
  return prisma.exchangeRate.findFirst({
    where: {
      id,
      ...(options.includeInactive ? {} : notDeleted()),
    },
    include: {
      baseCurrency: { select: { id: true, code: true, name: true } },
      quoteCurrency: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function listExchangeRatesWithCurrencies(
  options: ExchangeRateListOptions = {},
): Promise<ExchangeRateWithCurrencies[]> {
  const where: Prisma.ExchangeRateWhereInput = {
    ...(options.includeInactive ? {} : notDeleted()),
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
    include: {
      baseCurrency: { select: { id: true, code: true, name: true } },
      quoteCurrency: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
}

export type UpdateExchangeRateRecordData = {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: Prisma.Decimal | string;
  effectiveAt: Date;
  isActive: boolean;
};

export async function updateExchangeRateRecord(
  id: string,
  data: UpdateExchangeRateRecordData,
): Promise<ExchangeRate> {
  return prisma.exchangeRate.update({
    where: { id },
    data: {
      rate: data.rate,
      effectiveAt: data.effectiveAt,
      deletedAt: data.isActive ? null : new Date(),
      baseCurrency: { connect: { id: data.baseCurrencyId } },
      quoteCurrency: { connect: { id: data.quoteCurrencyId } },
    },
  });
}

export async function setExchangeRateActive(
  id: string,
  isActive: boolean,
): Promise<ExchangeRate> {
  return prisma.exchangeRate.update({
    where: { id },
    data: {
      deletedAt: isActive ? null : new Date(),
    },
  });
}
