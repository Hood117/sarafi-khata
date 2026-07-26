import "server-only";

import type { Currency, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateCurrencyData = {
  code: string;
  name: string;
  symbol?: string | null;
  isActive?: boolean;
  decimalPlaces?: number;
};

export type UpdateCurrencyData = {
  name?: string;
  symbol?: string | null;
  isActive?: boolean;
};

export type CurrencyListOptions = {
  includeDeleted?: boolean;
  isActive?: boolean;
};

function notDeleted(): Prisma.CurrencyWhereInput {
  return { deletedAt: null };
}

export async function createCurrency(
  data: CreateCurrencyData,
): Promise<Currency> {
  return prisma.currency.create({
    data: {
      code: data.code,
      name: data.name,
      symbol: data.symbol ?? null,
      isActive: data.isActive ?? true,
      decimalPlaces: data.decimalPlaces ?? 2,
    },
  });
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
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.symbol !== undefined ? { symbol: data.symbol } : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
    },
  });
}
