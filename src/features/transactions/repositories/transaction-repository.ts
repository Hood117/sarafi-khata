import "server-only";

import type {
  Prisma,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateTransactionData = Prisma.TransactionCreateInput;
export type UpdateTransactionData = Prisma.TransactionUpdateInput;

export type TransactionListOptions = {
  includeDeleted?: boolean;
  status?: TransactionStatus;
  type?: TransactionType;
  customerId?: string;
  /** Posted-by user id. */
  createdById?: string;
  /** Inclusive lower bound on `valueDate`. */
  valueDateFrom?: Date;
  /** Exclusive upper bound on `valueDate`. */
  valueDateTo?: Date;
  /** Max rows after orderBy (newest first). */
  take?: number;
};

function notDeleted(): Prisma.TransactionWhereInput {
  return { deletedAt: null };
}

function transactionListWhere(
  options: TransactionListOptions,
): Prisma.TransactionWhereInput {
  const valueDateFilter: Prisma.DateTimeFilter | undefined =
    options.valueDateFrom || options.valueDateTo
      ? {
          ...(options.valueDateFrom ? { gte: options.valueDateFrom } : {}),
          ...(options.valueDateTo ? { lt: options.valueDateTo } : {}),
        }
      : undefined;

  return {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(options.status ? { status: options.status } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(options.createdById ? { createdById: options.createdById } : {}),
    ...(valueDateFilter ? { valueDate: valueDateFilter } : {}),
  };
}

/**
 * Low-level create. Financial posting must use `postTransaction` instead —
 * not exported from the public transactions barrel.
 */
export async function createTransaction(
  data: CreateTransactionData,
): Promise<Transaction> {
  return prisma.transaction.create({ data });
}

export async function findTransactionById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findTransactionByReference(
  reference: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      reference,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listTransactions(
  options: TransactionListOptions = {},
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: transactionListWhere(options),
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
    ...(typeof options.take === "number" && options.take > 0
      ? { take: Math.floor(options.take) }
      : {}),
  });
}

/**
 * Lightweight type column read for dashboard KPI grouping.
 * Uses the same filters as `listTransactions` — no ledger join.
 */
export async function listTransactionTypes(
  options: Omit<TransactionListOptions, "take"> = {},
): Promise<TransactionType[]> {
  const rows = await prisma.transaction.findMany({
    where: transactionListWhere(options),
    select: { type: true },
  });
  return rows.map((row) => row.type);
}

export async function updateTransaction(
  id: string,
  data: UpdateTransactionData,
): Promise<Transaction> {
  return prisma.transaction.update({
    where: { id },
    data,
  });
}

export async function softDeleteTransaction(id: string): Promise<Transaction> {
  // Release unique `reference` so document numbers can be reused after soft delete.
  return prisma.transaction.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      reference: `deleted:${id}`,
    },
  });
}
