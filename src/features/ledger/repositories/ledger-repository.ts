import "server-only";

import type { LedgerEntry, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateLedgerEntryData = Prisma.LedgerEntryCreateInput;
export type CreateLedgerEntryManyData = Prisma.LedgerEntryCreateManyInput;

export type LedgerEntryListOptions = {
  transactionId?: string;
  walletId?: string;
  currencyId?: string;
};

/**
 * Append-only ledger data access.
 * Provides create/read only — no update or delete.
 *
 * Prefer `postTransaction` for financial writes. These helpers are low-level
 * and are not part of the public `@/features/ledger` barrel.
 */
export async function createLedgerEntry(
  data: CreateLedgerEntryData,
): Promise<LedgerEntry> {
  return prisma.ledgerEntry.create({ data });
}

export async function createLedgerEntries(
  data: CreateLedgerEntryManyData[],
): Promise<number> {
  const result = await prisma.ledgerEntry.createMany({ data });
  return result.count;
}

export async function findLedgerEntryById(
  id: string,
): Promise<LedgerEntry | null> {
  return prisma.ledgerEntry.findUnique({
    where: { id },
  });
}

export async function listLedgerEntriesByTransaction(
  transactionId: string,
): Promise<LedgerEntry[]> {
  return prisma.ledgerEntry.findMany({
    where: { transactionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listLedgerEntriesByWallet(
  walletId: string,
  options: { currencyId?: string } = {},
): Promise<LedgerEntry[]> {
  return prisma.ledgerEntry.findMany({
    where: {
      walletId,
      ...(options.currencyId ? { currencyId: options.currencyId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listLedgerEntries(
  options: LedgerEntryListOptions = {},
): Promise<LedgerEntry[]> {
  const where: Prisma.LedgerEntryWhereInput = {
    ...(options.transactionId ? { transactionId: options.transactionId } : {}),
    ...(options.walletId ? { walletId: options.walletId } : {}),
    ...(options.currencyId ? { currencyId: options.currencyId } : {}),
  };

  return prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}
