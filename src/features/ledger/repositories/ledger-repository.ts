import "server-only";

import type { LedgerEntry, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateLedgerEntryData = Prisma.LedgerEntryCreateInput;
export type CreateLedgerEntryManyData = Prisma.LedgerEntryCreateManyInput;

export type LedgerEntryListOptions = {
  transactionId?: string;
  /** Batch filter — ignored when empty (avoids invalid SQL `IN ()`). */
  transactionIds?: readonly string[];
  walletId?: string;
  /** Batch filter — ignored when empty (avoids invalid SQL `IN ()`). */
  walletIds?: readonly string[];
  currencyId?: string;
  /**
   * When true, include ledger lines for soft-deleted transactions.
   * Default false so archived postings drop out of cash/balance reads.
   */
  includeDeletedTransactions?: boolean;
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
  const transactionIds = options.transactionIds?.filter(Boolean) ?? [];
  const walletIds = options.walletIds?.filter(Boolean) ?? [];

  if (options.transactionIds && transactionIds.length === 0) {
    return [];
  }

  if (options.walletIds && walletIds.length === 0) {
    return [];
  }

  const where: Prisma.LedgerEntryWhereInput = {
    ...(options.transactionId ? { transactionId: options.transactionId } : {}),
    ...(transactionIds.length > 0
      ? { transactionId: { in: [...transactionIds] } }
      : {}),
    ...(options.walletId ? { walletId: options.walletId } : {}),
    ...(walletIds.length > 0 ? { walletId: { in: [...walletIds] } } : {}),
    ...(options.currencyId ? { currencyId: options.currencyId } : {}),
    ...(options.includeDeletedTransactions
      ? {}
      : { transaction: { deletedAt: null } }),
  };

  return prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}
